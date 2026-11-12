// Unfry on YouTube. No model here: every video card is let through, so every
// card arrives locked. The title stays, the picture goes behind the lock, a
// hover plays nothing, and a click opens nothing until the lock is opened by
// a held press or a sum. The feed is dealt out a page at a time; cards on
// other pages keep their place and show nothing, so the grid's height, and
// YouTube's idea of where its end is, do not move.
import type { PublicSettings } from '../common/settings';
import { mountLock } from '../unfry/lock';
import { createPager } from '../unfry/pager';

type UnfrySettings = Pick<
  PublicSettings,
  'unfryYoutube' | 'unfryHoldMs' | 'unfryPuzzle' | 'unfryPageSize' | 'youtubeEnabled'
>;

/** A video card on either site. The outermost match is the card. */
const cardSelector = [
  'ytd-rich-item-renderer',
  'ytd-compact-video-renderer',
  'ytd-video-renderer',
  'ytd-grid-video-renderer',
  'yt-lockup-view-model',
  'ytm-rich-item-renderer',
  'ytm-video-with-context-renderer',
  'ytm-compact-video-renderer',
  'ytm-media-item',
].join(', ');
const thumbSelector = [
  'ytd-thumbnail',
  'yt-thumbnail-view-model',
  'ytm-thumbnail-cover',
  '.video-thumbnail-container',
  '.video-thumbnail-container-fluid',
  'ytd-playlist-thumbnail',
].join(', ');
const titleSelector = '#video-title, .ytLockupMetadataViewModelTitle, .media-item-headline, h3, h4';
const channelSelector =
  'ytd-channel-name #text, .ytContentMetadataViewModelMetadataText, .ytd-channel-name, ytm-badge-and-byline-renderer .yt-core-attributed-string';
const durationSelector =
  'ytd-thumbnail-overlay-time-status-renderer #text, badge-shape .ytBadgeShapeText, .yt-badge-shape__text, ytm-thumbnail-overlay-time-status-renderer';
const LOCKED = 'data-aitf-yt-locked';
const BLANK = 'data-aitf-yt-blank';
const SCAN_THROTTLE = 150;
const POLL_INTERVAL = 1500;

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

type Card = { element: HTMLElement; key: string };

export function cards(root: ParentNode = document): Card[] {
  const found: Card[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(cardSelector)) {
    if (element.parentElement?.closest(cardSelector)) continue;
    const link = element.querySelector<HTMLAnchorElement>(
      'a[href*="/watch?v="], a[href^="/shorts/"], a[href*="/playlist?list="]',
    );
    const key = link?.getAttribute('href') ?? '';
    if (!key) continue;
    found.push({ element, key: key.split('&pp=')[0]! });
  }
  return found;
}

export function describe(card: HTMLElement) {
  const title = squash(card.querySelector(titleSelector)?.textContent);
  const channel = squash(card.querySelector(channelSelector)?.textContent);
  const duration = squash(card.querySelector(durationSelector)?.textContent);
  return { title, channel, duration };
}

export class UnfryYouTube {
  private settings: UnfrySettings | null = null;
  private readonly unlocked = new Set<string>();
  private readonly locks = new Map<
    HTMLElement,
    { key: string; signature: string; down: () => void }
  >();
  private readonly pager = createPager();
  private startKey: string | null = null;
  private history: string[] = [];
  private wantsNext = false;
  private observer: MutationObserver | null = null;
  private scanTimer = 0;
  private pollTimer = 0;
  private running = false;

  start(settings: UnfrySettings) {
    this.settings = settings;
    if (this.running) {
      this.scan();
      return;
    }
    this.running = true;
    this.observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => !(mutation.target as Element).closest?.('.aitf-yt-lock')))
        this.scheduleScan();
    });
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
    this.pollTimer = window.setInterval(() => this.scan(), POLL_INTERVAL);
    window.addEventListener('scroll', this.scheduleScan, { passive: true });
    window.addEventListener('yt-navigate-finish', this.onNavigate);
    document.addEventListener('click', this.onClick, true);
    document.addEventListener('auxclick', this.onClick, true);
    this.scan();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.observer?.disconnect();
    window.clearTimeout(this.scanTimer);
    window.clearInterval(this.pollTimer);
    window.removeEventListener('scroll', this.scheduleScan);
    window.removeEventListener('yt-navigate-finish', this.onNavigate);
    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('auxclick', this.onClick, true);
    for (const [element, lock] of this.locks) {
      lock.down();
      element.removeAttribute(LOCKED);
    }
    this.locks.clear();
    for (const element of document.querySelectorAll(`[${BLANK}]`)) element.removeAttribute(BLANK);
    this.pager.destroy();
    this.startKey = null;
    this.history = [];
  }

  private onNavigate = () => {
    this.startKey = null;
    this.history = [];
    this.wantsNext = false;
    this.scan();
  };

  private scheduleScan = () => {
    if (!this.running || this.scanTimer) return;
    this.scanTimer = window.setTimeout(() => {
      this.scanTimer = 0;
      this.scan();
    }, SCAN_THROTTLE);
  };

  /** A locked card opens nothing. A click anywhere on it asks for the sum. */
  private onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('.aitf-yt-lock')) return;
    const card = target.closest<HTMLElement>(`[${LOCKED}]`);
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    const lock = card.querySelector<HTMLElement>('.aitf-lock');
    lock?.focus({ preventScroll: true });
    lock?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  };

  scan() {
    const settings = this.settings;
    if (!this.running || !settings) return;
    const all = cards();
    const seen = new Set<HTMLElement>();
    const size = settings.unfryPageSize;
    let start = this.startKey === null ? 0 : all.findIndex((card) => card.key === this.startKey);
    if (start < 0) {
      // The page's first card is gone (a refresh, a different feed): start over.
      start = 0;
      this.startKey = all[0]?.key ?? null;
      this.history = [];
    } else if (this.startKey === null && all[0]) {
      this.startKey = all[0].key;
    }
    const end = Math.min(all.length, start + size) - 1;
    const next = all[end + 1];
    if (this.wantsNext && next) {
      this.wantsNext = false;
      this.history.push(this.startKey!);
      this.startKey = next.key;
      this.scrollTo(next.element);
      this.scan();
      return;
    }
    all.forEach((card, index) => {
      seen.add(card.element);
      const onPage = index >= start && index <= end;
      if (onPage) card.element.removeAttribute(BLANK);
      else card.element.setAttribute(BLANK, '');
      if (!onPage || this.unlocked.has(card.key)) this.unlock(card.element);
      else this.lock(card, settings);
    });
    for (const element of this.locks.keys()) if (!seen.has(element)) this.unlock(element);
    this.pager.update(
      all.length
        ? {
            page: this.history.length + 1,
            hasPrev: this.history.length > 0,
            hasNext: next !== undefined,
            shown: Math.max(0, end - start + 1),
            size,
            onPrev: () => this.prev(),
            onNext: () => this.next(all[end]?.element ?? null),
          }
        : null,
    );
  }

  private lock(card: Card, settings: UnfrySettings) {
    const thumb = card.element.querySelector<HTMLElement>(thumbSelector);
    if (!thumb) return;
    const { title, channel, duration } = describe(card.element);
    const signature = `${card.key}:${title}:${channel}:${duration}:${settings.unfryHoldMs}:${settings.unfryPuzzle}`;
    const existing = this.locks.get(card.element);
    if (existing?.signature === signature && card.element.querySelector('.aitf-yt-lock')) return;
    existing?.down();
    if (getComputedStyle(thumb).position === 'static') thumb.style.position = 'relative';
    const root = document.createElement('div');
    root.className = 'aitf-yt-lock';
    thumb.append(root);
    card.element.setAttribute(LOCKED, '');
    const unmount = mountLock(root, {
      layout: 'cover',
      title: title || 'Video',
      facts: [channel, duration].filter(Boolean),
      holdMs: settings.unfryHoldMs,
      difficulty: settings.unfryPuzzle,
      onUnlock: () => {
        this.unlocked.add(card.key);
        this.unlock(card.element);
      },
    });
    this.locks.set(card.element, {
      key: card.key,
      signature,
      down: () => {
        unmount();
        root.remove();
      },
    });
  }

  private unlock(element: HTMLElement) {
    const lock = this.locks.get(element);
    if (lock) {
      lock.down();
      this.locks.delete(element);
    }
    element.removeAttribute(LOCKED);
  }

  private next(last: HTMLElement | null) {
    this.wantsNext = true;
    this.scan();
    if (this.wantsNext && last) {
      const bottom =
        last.getBoundingClientRect().bottom + window.scrollY - window.innerHeight * 0.6;
      window.scrollTo({ top: Math.max(0, bottom) });
    }
  }

  private prev() {
    const start = this.history.pop();
    if (start === undefined) return;
    this.wantsNext = false;
    this.startKey = start;
    this.scan();
    const first = cards().find((card) => card.key === start);
    if (first) this.scrollTo(first.element);
  }

  private scrollTo(element: HTMLElement) {
    const top = element.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top: Math.max(0, top) });
  }
}
