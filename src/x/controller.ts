import { request } from '../common/messages';
import type { Post, Verdict } from '../common/post';
import { decisionScope, type PublicSettings } from '../common/settings';
import { authorRule } from '../common/author-rules';
import type { CorrectionVerdict } from '../common/messages';
import * as extract from './extract';
import { createRules } from './rules';
import * as view from './view';
import { ThreadControl } from './thread-control';
import { NotInterested } from './not-interested';
import { Feedback } from './feedback';

type Phase =
  | { type: 'queued' }
  | { type: 'running' }
  | { type: 'decided'; verdict: Verdict }
  | { type: 'retry'; after: number };
type RecordState = {
  post: Post;
  phase: Phase;
  attempts: number;
  revealed: boolean;
  counted: boolean;
};
// A post is identified by its id alone. Expanding "Show more" rewrites the
// visible text without making it a different post, and a decided post must
// never be paid for twice.
const identity = (post: Post) => post.key;
const SCAN_INTERVAL = 100;
const POLL_INTERVAL = 200;
// A batch leaves as soon as it is full; this only bounds how long a partial one
// waits for stragglers. Requests then overlap up to the reader's concurrency.
const BATCH_WINDOW = 200;
// How long a "Not interested" click may take to turn into X's feedback card.
const FEEDBACK_WAIT = 8000;
// Acknowledged claims live for the tab; this bounds them on long sessions.
const MAX_TOLD = 600;
// After a navigation X remounts the list and restores the scroll position over
// the next second or so. Nothing Sharp does may move cells until then.
const NAV_SETTLE = 1500;
// How long after a return to Home the reader's anchor post is still worth
// putting back. Later than this they have moved on.
const RESTORE_WINDOW = 3000;
const isHome = (path: string) => /^\/home\/?$/.test(path);
type Anchor = { id: string; top: number };
const cellSelector = '[data-testid="cellInnerDiv"]';
/** X's acknowledgement in a timeline cell: no post, and an Undo to take it back. */
function isFeedbackCard(cell: HTMLElement): boolean {
  if (cell.querySelector(extract.articleSelector)) return false;
  return [...cell.querySelectorAll<HTMLElement>('[role="button"], button')].some(
    (button) => !button.closest('.aitf-slot') && /^undo$/i.test(button.textContent?.trim() ?? ''),
  );
}
type Told = {
  id: string;
  cell: HTMLElement;
  parent: HTMLElement;
  index: number;
  previous: Element | null;
  at: number;
  acked: boolean;
  /** Reported over the wire: the post stays in its cell until X rebuilds the
   *  timeline and draws its card from the server's memory of the report. */
  wire?: boolean;
  /** X's card has been seen in this spot at least once. */
  carded?: boolean;
  /** A card Sharp could not tie to a post. Dressed while it lasts, never relocated. */
  anonymous?: boolean;
  /** Lazily built matcher for X's "Show fewer posts from <handle>". */
  named?: RegExp;
};

/** Owns the tab lifecycle. A post has one state, independent of recycled DOM nodes. */
export class TimelineController {
  private settings: PublicSettings | null = null;
  private rules: ReturnType<typeof createRules> | null = null;
  private records = new Map<string, RecordState>();
  private elements = new WeakMap<HTMLElement, string>();
  private threadContext = new Set<string>();
  private path = '';
  private openedAt = 0;
  /** The post at the top of the viewport while on Home, refreshed each scan. */
  private homeAnchor: Anchor | null = null;
  /** The anchor being put back after a return to Home, until the window ends. */
  private restoring: Anchor | null = null;
  private restoreUntil = 0;
  private generation = 0;
  private refreshing = 0;
  private inFlight = 0;
  private stopped = false;
  private scanTimer = 0;
  private scannedAt = 0;
  private batchTimer = 0;
  private pollTimer = 0;
  private observer: MutationObserver | null = null;
  private readonly threadControl: ThreadControl;
  private readonly notInterested = new NotInterested({
    // Take the spot while the post is still in the page: X may swap it for
    // its card synchronously inside the click that follows.
    before: (article, id) => this.claim(article, id, false),
    after: () => this.syncFeedback(),
  });

  /** Only a menu click needs the per-mutation sync: X may swap that cell any
   *  moment. Wire claims wait for the throttled scan. */
  private menuClaims(): boolean {
    for (const entry of this.told.values()) if (!entry.wire) return true;
    return false;
  }

  /** Remember where a reported post sits, so X's card can be dressed when it
   *  appears there: right after a menu click, or whenever X rebuilds the
   *  timeline after a wire report. */
  private claim(article: HTMLElement, id: string, wire: boolean) {
    const cell = article.closest<HTMLElement>(cellSelector);
    if (!cell?.isConnected || !cell.parentElement) return;
    this.told.set(id, {
      id,
      cell,
      parent: cell.parentElement,
      index: [...cell.parentElement.children].indexOf(cell),
      previous: cell.previousElementSibling,
      at: Date.now(),
      acked: wire,
      wire,
    });
    if (this.told.size > MAX_TOLD) {
      const oldest = this.told.keys().next().value;
      if (oldest !== undefined) this.told.delete(oldest);
    }
    this.syncFeedback();
  }
  /** Posts told to X, by post id. The cell is claimed at click time and held
   *  through X's answer; X may swap the cell's contents or the cell itself, so
   *  the spot is also remembered by neighbours. */
  private told = new Map<string, Told>();
  private anonymousCards = 0;
  /** X's own request, sent directly: no menu, no card, no cell to claim. The
   *  menu is the fallback when the wire has not supplied what it needs. */
  private readonly feedback = new Feedback();
  /** Every post reported over the wire, and how far it got. */
  private reported = new Map<string, 'sending' | 'told'>();
  /** What the banner said for each hidden post, so the card can say it too. */
  private hiddenInfo = new Map<
    string,
    { handle: string; name: string; reason: string; unsure: boolean }
  >();

  constructor(private readonly send: typeof request = request) {
    this.threadControl = new ThreadControl(send);
  }

  async start() {
    // Listen before the first timeline response lands; metadata arrives with it.
    this.feedback.start();
    await this.refresh();
    if (this.stopped) return;
    this.observer = new MutationObserver((mutations) => {
      // A swapped cell must be re-claimed before this frame paints. Only the
      // O(1) part runs here; the page-wide lookup waits for the throttled scan.
      if (this.menuClaims()) this.syncFeedback(false);
      let relevant = false;
      let fresh = false;
      for (const mutation of mutations) {
        if (mutation.target instanceof Element && mutation.target.closest('.aitf-slot')) continue;
        relevant = true;
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          const article = node.matches(extract.articleSelector)
            ? node
            : node.querySelector(extract.articleSelector);
          if (article && !article.querySelector(':scope > .aitf-slot')) {
            fresh = true;
            break;
          }
        }
        if (fresh) break;
      }
      // A post that just mounted with a verdict already known must take its
      // final height before X measures it at the next layout. Otherwise X
      // caches the full height, positions the list on it, then re-lays
      // everything out when Sharp collapses the post a moment later.
      if (fresh) this.scan();
      else if (relevant) this.scheduleScan();
    });
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['href', 'src', 'poster'],
    });
    // Also covers SPA navigation, delayed focal posts and retry deadlines.
    this.pollTimer = window.setInterval(() => this.scan(), POLL_INTERVAL);
    chrome.storage?.onChanged?.addListener(this.onStorage);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onPageShow);
    for (const type of ['wheel', 'touchstart', 'keydown'] as const)
      window.addEventListener(type, this.onReaderScroll, { passive: true, capture: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true, capture: true });
    this.scan();
  }

  /** The reader took over; the anchor is no longer theirs to be held at. */
  private onReaderScroll = () => {
    this.restoring = null;
  };
  /** A click may be the one that leaves Home: remember where the reader is. */
  private onPointerDown = () => {
    if (isHome(this.path) && !this.restoring) this.homeAnchor = this.anchorInView();
  };

  private onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes.settings) void this.refresh();
  };
  private onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) this.stop();
  };
  private onPageShow = () => {
    void this.refresh();
  };

  async refresh() {
    const revision = ++this.refreshing;
    try {
      const settings = await this.send({ type: 'GET_PUBLIC_SETTINGS' });
      if (this.stopped || revision !== this.refreshing) return;
      if (
        !this.settings ||
        decisionScope(this.settings) !== decisionScope(settings) ||
        this.settings.configured !== settings.configured
      ) {
        this.generation++;
        this.records.clear();
      }
      this.settings = settings;
      this.rules = createRules(settings);
      document.documentElement.dataset.aitfMotion = settings.motion;
      if (settings.greyscaleUi) document.documentElement.dataset.aitfGreyUi = '';
      else delete document.documentElement.dataset.aitfGreyUi;
      if (settings.greyscaleContent) document.documentElement.dataset.aitfGreyContent = '';
      else delete document.documentElement.dataset.aitfGreyContent;
      this.scan();
    } catch {
      // An invalidated extension context cannot recover without reloading the tab.
      this.stop();
    }
  }

  stop() {
    this.stopped = true;
    this.generation++;
    this.observer?.disconnect();
    window.clearTimeout(this.scanTimer);
    window.clearTimeout(this.batchTimer);
    window.clearInterval(this.pollTimer);
    chrome.storage?.onChanged?.removeListener(this.onStorage);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('pageshow', this.onPageShow);
    for (const type of ['wheel', 'touchstart', 'keydown'] as const)
      window.removeEventListener(type, this.onReaderScroll, { capture: true });
    window.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    this.restoring = null;
    this.records.clear();
    this.told.clear();
    this.reported.clear();
    this.hiddenInfo.clear();
    this.threadControl.dispose();
    this.notInterested.stop();
    this.feedback.stop();
    delete document.documentElement.dataset.aitfMotion;
    delete document.documentElement.dataset.aitfGreyUi;
    delete document.documentElement.dataset.aitfGreyContent;
    view.restoreAll();
  }

  getSettings = () => (this.stopped ? null : this.settings);

  /** The reader overrules a verdict. The post settles at once; the example and
   *  the cache entry follow, so a reload agrees with what they see now. */
  correct(post: Post, verdict: CorrectionVerdict) {
    if (this.stopped) return Promise.resolve();
    if (verdict !== 'forget') {
      const hide = verdict === 'hide';
      const decided: Verdict = { key: post.key, hide, reason: hide ? 'Your correction' : '' };
      const record = this.records.get(post.key);
      if (record) {
        record.phase = { type: 'decided', verdict: decided };
        record.revealed = false;
      } else {
        this.records.set(post.key, {
          post,
          phase: { type: 'decided', verdict: decided },
          attempts: 0,
          revealed: false,
          counted: false,
        });
      }
      this.scan();
    }
    return this.send({ type: 'CORRECT_VERDICT', post, verdict });
  }

  /** What a revealed post can still do about the verdict it overruled. Reads
   *  live settings each time, so the popup and the page agree. */
  private recourse(post: Post): view.Recourse {
    const text = post.text.trim().slice(0, 280);
    return {
      handle: post.handle,
      status: () => ({
        allowed: this.settings ? authorRule(this.settings, post.handle) === 'allow' : false,
        taught: Boolean(
          this.settings?.corrections.some((entry) => entry.text === text && !entry.hide),
        ),
      }),
      setAllowed: (allowed) =>
        this.send({
          type: 'SET_AUTHOR_RULE',
          handle: post.handle,
          rule: allowed ? 'allow' : 'default',
        }),
      // Teaching from a revealed post must not re-decide it: it is already showing.
      setTaught: (taught) =>
        this.send({ type: 'CORRECT_VERDICT', post, verdict: taught ? 'keep' : 'forget' }),
    };
  }

  /** From the post's menu: the article is the only handle the menu has. */
  correctPost = (id: string, verdict: 'keep' | 'hide') => {
    const article = extract.focalArticle(id);
    const post = article && extract.describe(article, 0, null);
    if (post) void this.correct(post, verdict).catch(() => {});
  };

  /** Throttle, not debounce: a burst of mutations scans immediately and then at
   *  most once per interval, so a continuous stream can never starve it. */
  private scheduleScan() {
    if (this.stopped) return;
    const wait = this.scannedAt + SCAN_INTERVAL - Date.now();
    if (wait <= 0) return this.scan();
    if (this.scanTimer) return;
    this.scanTimer = window.setTimeout(() => {
      this.scanTimer = 0;
      this.scan();
    }, wait);
  }

  scan() {
    if (this.stopped || !this.settings || !this.rules) return;
    this.scannedAt = Date.now();
    this.threadControl.update(this.settings);
    if (this.path !== location.pathname) {
      const returning = isHome(location.pathname) && this.path !== '' && !isHome(this.path);
      this.path = location.pathname;
      this.openedAt = Date.now();
      this.threadContext.clear();
      if (returning && this.homeAnchor) {
        this.restoring = this.homeAnchor;
        this.restoreUntil = this.openedAt + RESTORE_WINDOW;
      }
    }
    const thread = extract.currentThread();
    const focal = extract.focalArticle(thread);
    const waitingForFocal = thread && !focal && Date.now() - this.openedAt < 2500;
    const live = new Set<string>();
    for (const article of document.querySelectorAll<HTMLElement>(extract.articleSelector)) {
      const post = extract.describe(
        article,
        this.settings.analyzeImages ? this.settings.maxImagesPerPost : 0,
        focal,
      );
      if (!post) {
        view.reveal(article);
        continue;
      }
      const key = identity(post);
      if (this.elements.get(article) !== key) {
        view.reveal(article);
        this.elements.set(article, key);
      }
      live.add(key);
      if (extract.isThreadContext(article, focal)) this.threadContext.add(key);
      const decision = this.rules(
        post,
        extract.reposter(article),
        thread,
        this.threadContext.has(key),
        this.path,
      );
      let record = this.records.get(key);
      if (!record) {
        record = { post, phase: { type: 'queued' }, attempts: 0, revealed: false, counted: false };
        this.records.set(key, record);
      }
      const settled = record;
      const apply = (state: view.PostState) =>
        view.apply(article, state, () => {
          settled.revealed = true;
          this.scan();
        });
      const verdict = record.phase.type === 'decided' ? record.phase.verdict : null;
      if (record.revealed && verdict?.hide) {
        // Overruled by hand: the post is back, with a way to say why.
        apply({ kind: 'revealed', recourse: this.recourse(settled.post) });
        continue;
      }
      if (record.revealed || decision === 'show' || waitingForFocal) {
        apply({ kind: 'show' });
        continue;
      }
      // An undecided post far from the fold is left exactly as X drew it.
      if (
        decision === 'ai' &&
        !verdict &&
        !extract.nearViewport(article, this.settings.lookahead)
      ) {
        apply({ kind: 'show' });
        continue;
      }
      const reason = decision !== 'ai' ? decision : verdict?.hide ? verdict.reason : '';
      if (reason) {
        const unsure = decision === 'ai' && Boolean(verdict?.unsure);
        apply({
          kind: 'hidden',
          name: extract.author(article).name,
          reason,
          unsure,
          // A close call keeps its banner even when everything else is gone.
          style: this.settings.hideFully && !unsure ? 'remove' : this.settings.hideStyle,
          showAuthor: this.settings.showAuthor,
          told: this.reported.get(key),
        });
        if (!record.counted) {
          record.counted = true;
          void this.send({ type: 'STAT_HIDDEN', count: 1 }).catch(() => {});
        }
        // Only the home timeline offers "Not interested", and only there does it
        // teach anything. A close call is never reported: X's ranking should
        // learn only from verdicts Sharp would stand behind.
        if (this.settings.notInterested && !unsure && /^\/home\/?$/.test(this.path))
          this.report(article, key, reason);
      } else if (record.phase.type === 'queued' || record.phase.type === 'running') {
        // A verdict is still outstanding: mark the post rather than let it settle twice.
        apply({ kind: 'pending' });
      } else {
        apply({ kind: 'show' });
      }
    }
    // Keep settled identities for remounts, but bound memory during long scrolling sessions.
    if (this.records.size > 1000) {
      for (const [key, record] of this.records) {
        if (!live.has(key) && record.phase.type !== 'running') {
          this.records.delete(key);
          // A told post keeps its banner text: its card can come back any time.
          if (!this.told.has(key)) this.hiddenInfo.delete(key);
        }
        if (this.records.size <= 1000) break;
      }
    }
    this.syncFeedback();
    this.scheduleFlush();
    this.restoreAnchor();
  }

  /** The post at the top of the viewport, by id, with its offset. */
  private anchorInView(): Anchor | null {
    let best: Anchor | null = null;
    for (const article of document.querySelectorAll<HTMLElement>(extract.articleSelector)) {
      const rect = article.getBoundingClientRect();
      if (rect.bottom <= 0 || (best && rect.top >= best.top)) continue;
      const id = extract.postId(article);
      if (id) best = { id, top: rect.top };
    }
    return best;
  }

  /** Once X has finished its own restore after a return to Home, check the
   *  reader's anchor post once and nudge it back if X missed. */
  private restoreAnchor() {
    if (!this.restoring) return;
    const now = Date.now();
    if (now < this.openedAt + NAV_SETTLE) return;
    const anchor = this.restoring;
    this.restoring = null;
    if (now >= this.restoreUntil) return;
    const article = extract.focalArticle(anchor.id);
    const shift = article ? article.getBoundingClientRect().top - anchor.top : 0;
    if (Math.abs(shift) >= 24) window.scrollBy(0, shift);
  }

  /** Tell X once per post. Over the wire when the page has given up the
   *  metadata and headers; through the menu otherwise, or if X refuses. */
  private report(article: HTMLElement, key: string, reason: string) {
    if (this.reported.has(key) || this.told.has(key)) return;
    const author = extract.author(article);
    this.hiddenInfo.set(key, { handle: author.handle, name: author.name, reason, unsure: false });
    if (!this.feedback.ready(key)) {
      this.notInterested.request(article, key);
      return;
    }
    this.reported.set(key, 'sending');
    void this.feedback.send(key).then((ok) => {
      if (this.stopped) return;
      if (ok) {
        this.reported.set(key, 'told');
        // X's client knows nothing of this, but its server does: the next
        // timeline rebuild draws X's card here. Claim the spot now.
        const current = extract.focalArticle(key);
        if (current) this.claim(current, key, true);
      } else {
        this.reported.delete(key);
        const current = extract.focalArticle(key);
        if (current) this.notInterested.request(current, key);
      }
      this.scheduleScan();
    });
  }

  /** X's card for a reported post carries no post id. After a rebuild (back
   *  from a thread, a reload) the server redraws every card from its memory,
   *  so the id comes from the wire: the entries it placed between the card's
   *  nearest identified neighbours. A run of cards maps onto a run of ids.
   *  Cells are taken in visual order; X recycles nodes, so DOM order lies. */
  private adoptCards() {
    const claimed = new Set([...this.told.values()].map((entry) => entry.cell));
    const all = [...document.querySelectorAll<HTMLElement>(cellSelector)];
    // Layout is only forced when there is a card nobody has claimed yet.
    if (!all.some((cell) => !claimed.has(cell) && isFeedbackCard(cell))) return;
    const cells = all
      .map((cell) => ({ cell, top: cell.getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top)
      .map(({ cell }) => cell);
    const idOf = (cell: HTMLElement) => {
      const article = cell.querySelector<HTMLElement>(extract.articleSelector);
      return article ? extract.postId(article) : '';
    };
    const known = (id: string) =>
      this.reported.has(id) || this.told.has(id) || this.hiddenInfo.has(id);
    const adopt = (cell: HTMLElement, id: string) => {
      if (!cell.parentElement) return;
      const existing = id ? this.told.get(id) : undefined;
      const entry: Told = existing ?? {
        id: id || `card:${++this.anonymousCards}`,
        cell,
        parent: cell.parentElement,
        index: 0,
        previous: null,
        at: Date.now(),
        acked: true,
        wire: true,
        anonymous: !id,
      };
      entry.cell = cell;
      entry.parent = cell.parentElement;
      entry.index = [...cell.parentElement.children].indexOf(cell);
      entry.previous = cell.previousElementSibling;
      entry.acked = true;
      entry.carded = true;
      this.told.set(entry.id, entry);
      claimed.add(cell);
    };

    // First by neighbours: a run of cards between two identified posts.
    const unmatched: HTMLElement[] = [];
    let start = -1;
    for (let index = 0; index <= cells.length; index++) {
      const current = cells[index];
      const card = current !== undefined && isFeedbackCard(current);
      if (card && start < 0) start = index;
      if (card || start < 0) continue;
      const end = index - 1;
      const before = cells[start - 1];
      const previous = before ? idOf(before) : '';
      const next = current ? idOf(current) : '';
      const count = end - start + 1;
      let ids = previous || next ? this.feedback.between(previous, next) : [];
      if (ids.length !== count) ids = ids.filter(known);
      for (let offset = 0; offset < count; offset++) {
        const cell = cells[start + offset];
        if (!cell || claimed.has(cell)) continue;
        const id = ids.length === count ? ids[offset] : '';
        if (id) adopt(cell, id);
        else unmatched.push(cell);
      }
      start = -1;
    }
    if (!unmatched.length) return;

    // Then page-wide: every reported post that is neither on screen as a post
    // nor already tied to a card, in the wire's order, against the cards left.
    const visible = new Set(cells.map(idOf));
    const candidates = [...new Set([...this.reported.keys(), ...this.told.keys()])].filter(
      (id) => !id.startsWith('card:') && !visible.has(id) && !this.told.get(id)?.cell.isConnected,
    );
    const ranked = this.feedback.rank(candidates);
    if (ranked.length === unmatched.length) {
      unmatched.forEach((cell, index) => adopt(cell, ranked[index] ?? ''));
      return;
    }
    for (const cell of unmatched) adopt(cell, '');
  }

  /** When X replaces the whole cell, the new one sits where the old one did.
   *  Failing that, X's card names the author, so it can be found by handle;
   *  that walk is page-wide and only runs from the throttled scan. */
  private cellAtSpot(entry: Told, thorough: boolean, taken: Set<HTMLElement>): HTMLElement | null {
    const usable = (candidate: Element | null | undefined): candidate is HTMLElement =>
      candidate instanceof HTMLElement &&
      candidate.isConnected &&
      candidate.matches(cellSelector) &&
      !taken.has(candidate) &&
      !candidate.querySelector(extract.articleSelector);
    const candidates = [
      entry.previous?.isConnected ? entry.previous.nextElementSibling : null,
      entry.parent.isConnected ? entry.parent.children[entry.index] : null,
    ];
    for (const candidate of candidates) if (usable(candidate)) return candidate;
    if (!thorough) return null;
    const handle = this.hiddenInfo.get(entry.id)?.handle;
    if (!handle) return null;
    entry.named ??= new RegExp(`\\b${handle}\\b`, 'i');
    for (const candidate of document.querySelectorAll(cellSelector)) {
      if (
        usable(candidate) &&
        candidate.querySelector('[role="button"], button') &&
        entry.named.test(candidate.textContent ?? '')
      )
        return candidate;
    }
    return null;
  }

  /** verdict → hidden → told X → the spot stays hidden while X's card
   *  materialises → nothing, or "hidden, X told" with Undo. The cell is handed
   *  back when X recycles it for a post, the reader undoes, or X never answers. */
  private syncFeedback(thorough = true) {
    if (!this.settings) return;
    if (thorough && this.settings.notInterested && Date.now() - this.openedAt > NAV_SETTLE)
      this.adoptCards();
    const now = Date.now();
    let taken: Set<HTMLElement> | null = null;
    for (const [id, entry] of this.told) {
      if (!entry.cell.isConnected) {
        if (entry.anonymous) {
          this.told.delete(id);
          continue;
        }
        // A wire report's card is tied back by the wire's order, not by spot.
        if (entry.wire) continue;
        taken ??= new Set([...this.told.values()].map((other) => other.cell));
        const cell = this.cellAtSpot(entry, thorough, taken);
        if (cell) {
          entry.cell = cell;
          taken.add(cell);
        } else if (!entry.acked && now - entry.at > FEEDBACK_WAIT) {
          // X never answered. An acknowledged one is kept: X redraws its card
          // from memory whenever the timeline is rebuilt, e.g. after opening
          // a post and going back, and it must be claimed again each time.
          this.told.delete(id);
        }
        continue;
      }
      const article = entry.cell.querySelector<HTMLElement>(extract.articleSelector);
      if (article) {
        const same = extract.postId(article) === id;
        // A wire report leaves the post in place; the banner is the record's.
        if (same && entry.wire && !entry.carded) continue;
        if (same && entry.acked) {
          // Undo brought the post back: the verdict stands, the claim is over.
          view.clearFeedback(entry.cell);
          this.told.delete(id);
          continue;
        }
        if (!same || now - entry.at > FEEDBACK_WAIT) {
          // X put another post in this cell. Let go of the node but not the
          // claim: X redraws its card from memory when this spot scrolls back
          // into view or the timeline is rebuilt, and it must be claimed again.
          view.clearFeedback(entry.cell);
          if (entry.acked) entry.cell = document.createElement('div');
          else this.told.delete(id);
          continue;
        }
      } else {
        entry.carded = true;
        if (entry.cell.querySelector('[role="button"], button')) entry.acked = true;
      }
      const info = this.hiddenInfo.get(id) ?? {
        handle: '',
        name: '',
        reason: 'Hidden',
        unsure: false,
      };
      const cell = entry.cell;
      view.applyFeedback(cell, {
        style: this.settings.hideFully && !info.unsure ? 'remove' : this.settings.hideStyle,
        name: info.name,
        reason: info.reason,
        showAuthor: this.settings.showAuthor,
        acked: entry.acked,
        onUndo: () => {
          // X's own Undo restores the post; Sharp then judges it again from its cache.
          const undo = [...cell.querySelectorAll<HTMLElement>('[role="button"], button')].find(
            (button) =>
              !button.closest('.aitf-slot') && /^undo$/i.test(button.textContent?.trim() ?? ''),
          );
          view.clearFeedback(cell);
          this.told.delete(id);
          undo?.click();
          this.scheduleScan();
        },
      });
    }
  }

  private scheduleFlush(delay = BATCH_WINDOW) {
    if (this.stopped || this.batchTimer || this.inFlight >= (this.settings?.concurrency ?? 1))
      return;
    this.batchTimer = window.setTimeout(() => {
      this.batchTimer = 0;
      this.flush();
    }, delay);
  }

  /** Fills a batch and hands it off without waiting for the answer. A full batch
   *  starts the next one immediately; a partial one waits out the window. */
  private flush() {
    if (this.stopped || !this.settings || !this.rules) return;
    if (this.inFlight >= this.settings.concurrency) return;
    const thread = extract.currentThread();
    const focal = extract.focalArticle(thread);
    if (thread && !focal && Date.now() - this.openedAt < 2500) return;
    const limit = this.settings.batchSize;
    const selected = new Map<string, RecordState>();
    // Re-read mounted posts and current rules immediately before spending money.
    for (const article of document.querySelectorAll<HTMLElement>(extract.articleSelector)) {
      const post = extract.describe(
        article,
        this.settings.analyzeImages ? this.settings.maxImagesPerPost : 0,
        focal,
      );
      if (!post || !extract.nearViewport(article, this.settings.lookahead)) continue;
      const key = identity(post);
      const record = this.records.get(key);
      if (
        !record ||
        record.revealed ||
        record.attempts >= 3 ||
        (record.phase.type !== 'queued' &&
          !(record.phase.type === 'retry' && record.phase.after <= Date.now()))
      )
        continue;
      if (
        this.rules(
          post,
          extract.reposter(article),
          thread,
          this.threadContext.has(key) || extract.isThreadContext(article, focal),
          location.pathname,
        ) !== 'ai'
      )
        continue;
      record.post = post;
      selected.set(key, record);
      if (selected.size >= limit) break;
    }
    if (!selected.size) return;
    const generation = this.generation;
    for (const record of selected.values()) {
      record.phase = { type: 'running' };
      record.attempts++;
    }
    this.inFlight++;
    void this.send({
      type: 'EVALUATE',
      scope: decisionScope(this.settings),
      items: [...selected.values()].map((record) => record.post),
    })
      .then(
        (results) => this.settle(selected, results, generation),
        () => {
          if (!chrome.runtime.id) this.stop();
          this.settle(selected, [], generation);
        },
      )
      .finally(() => {
        this.inFlight--;
        this.scheduleFlush(0);
      });
    // The queue had at least a full batch in it, so there is probably more.
    if (selected.size >= limit) this.scheduleFlush(0);
  }

  private settle(
    selected: Map<string, RecordState>,
    results: readonly Verdict[],
    generation: number,
  ) {
    if (this.stopped || generation !== this.generation) {
      this.scheduleScan();
      return;
    }
    const byKey = new Map(results.map((verdict) => [verdict.key, verdict]));
    for (const record of selected.values()) {
      const verdict = byKey.get(record.post.key);
      record.phase =
        verdict && !verdict.failed
          ? { type: 'decided', verdict }
          : { type: 'retry', after: Date.now() + 4000 * 2 ** (record.attempts - 1) };
    }
    this.scan();
  }
}
