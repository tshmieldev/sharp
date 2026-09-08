import { request } from '../common/messages';
import type { Post, Verdict } from '../common/post';
import { decisionScope, type PublicSettings } from '../common/settings';
import * as extract from './extract';
import { createRules } from './rules';
import * as view from './view';
import { ThreadControl } from './thread-control';

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
// waits for stragglers. Requests then overlap up to the in-flight ceiling.
const BATCH_WINDOW = 200;
const MAX_IN_FLIGHT = 3;

/** Owns the tab lifecycle. A post has one state, independent of recycled DOM nodes. */
export class TimelineController {
  private settings: PublicSettings | null = null;
  private rules: ReturnType<typeof createRules> | null = null;
  private records = new Map<string, RecordState>();
  private elements = new WeakMap<HTMLElement, string>();
  private threadContext = new Set<string>();
  private path = '';
  private openedAt = 0;
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

  constructor(private readonly send: typeof request = request) {
    this.threadControl = new ThreadControl(send);
  }

  async start() {
    await this.refresh();
    if (this.stopped) return;
    this.observer = new MutationObserver((mutations) => {
      if (
        mutations.some(
          (mutation) =>
            !(mutation.target instanceof Element && mutation.target.closest('.aitf-slot')),
        )
      ) {
        this.scheduleScan();
      }
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
    this.scan();
  }

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
    this.records.clear();
    this.threadControl.dispose();
    delete document.documentElement.dataset.aitfMotion;
    view.restoreAll();
  }

  getSettings = () => (this.stopped ? null : this.settings);

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
      this.path = location.pathname;
      this.openedAt = Date.now();
      this.threadContext.clear();
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
      if (record.revealed || decision === 'show' || waitingForFocal) {
        apply({ kind: 'show' });
        continue;
      }
      const verdict = record.phase.type === 'decided' ? record.phase.verdict : null;
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
        apply({
          kind: 'hidden',
          name: extract.author(article).name,
          reason,
          style: this.settings.hideStyle,
        });
        if (!record.counted) {
          record.counted = true;
          void this.send({ type: 'STAT_HIDDEN', count: 1 }).catch(() => {});
        }
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
        if (!live.has(key) && record.phase.type !== 'running') this.records.delete(key);
        if (this.records.size <= 1000) break;
      }
    }
    this.scheduleFlush();
  }

  private scheduleFlush(delay = BATCH_WINDOW) {
    if (this.stopped || this.batchTimer || this.inFlight >= MAX_IN_FLIGHT) return;
    this.batchTimer = window.setTimeout(() => {
      this.batchTimer = 0;
      this.flush();
    }, delay);
  }

  /** Fills a batch and hands it off without waiting for the answer. A full batch
   *  starts the next one immediately; a partial one waits out the window. */
  private flush() {
    if (this.stopped || !this.settings || !this.rules || this.inFlight >= MAX_IN_FLIGHT) return;
    const thread = extract.currentThread();
    const focal = extract.focalArticle(thread);
    if (thread && !focal && Date.now() - this.openedAt < 2500) return;
    const limit = this.settings.analyzeImages
      ? this.settings.imageBatchSize
      : this.settings.batchSize;
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
