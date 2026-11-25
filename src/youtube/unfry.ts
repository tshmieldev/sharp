// Unfry on YouTube. No model here: every video card is let through, so every
// card arrives locked. The title stays, the picture goes behind the lock, a
// hover plays nothing, and a click opens nothing until the lock is opened by
// a held press.
import type { PublicSettings } from '../common/settings';
import { mountLock } from '../unfry/lock';

type UnfrySettings = Pick<PublicSettings, 'unfryYoutube' | 'unfryHoldMs' | 'youtubeEnabled'>;

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
  // Shorts in a shelf, on both sites, and the older desktop reel.
  'ytm-shorts-lockup-view-model-v2',
  'ytm-shorts-lockup-view-model',
  'ytd-reel-item-renderer',
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
/** What YouTube reads to start a hover preview: the video playing over the
 *  thumbnail, picture and all. A locked card hears none of them. */
const HOVER_EVENTS = [
  'mouseover',
  'mouseenter',
  'mousemove',
  'pointerover',
  'pointerenter',
  'pointermove',
] as const;
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
    document.addEventListener('click', this.onClick, true);
    document.addEventListener('auxclick', this.onClick, true);
    for (const kind of HOVER_EVENTS) window.addEventListener(kind, this.onHover, true);
    document.addEventListener('play', this.onPlay, true);
    this.scan();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.observer?.disconnect();
    window.clearTimeout(this.scanTimer);
    window.clearInterval(this.pollTimer);
    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('auxclick', this.onClick, true);
    for (const kind of HOVER_EVENTS) window.removeEventListener(kind, this.onHover, true);
    document.removeEventListener('play', this.onPlay, true);
    for (const [element, lock] of this.locks) {
      lock.down();
      element.removeAttribute(LOCKED);
    }
    this.locks.clear();
  }

  private scheduleScan = () => {
    if (!this.running || this.scanTimer) return;
    this.scanTimer = window.setTimeout(() => {
      this.scanTimer = 0;
      this.scan();
    }, SCAN_THROTTLE);
  };

  /** A locked card opens nothing. A click anywhere on it points at the lock. */
  private onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('.aitf-yt-lock')) return;
    const card = target.closest<HTMLElement>(`[${LOCKED}]`);
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    card.querySelector<HTMLElement>('.aitf-lock')?.focus({ preventScroll: true });
  };

  private onHover = (event: Event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(`[${LOCKED}]`)) event.stopPropagation();
  };

  /** The phone site starts a card's preview as it scrolls into view. Hidden is
   *  not enough: it would still stream, and may not be muted. */
  private onPlay = (event: Event) => {
    const target = event.target;
    if (target instanceof HTMLMediaElement && target.closest(`[${LOCKED}]`)) target.pause();
  };

  scan() {
    const settings = this.settings;
    if (!this.running || !settings) return;
    const seen = new Set<HTMLElement>();
    for (const card of cards()) {
      seen.add(card.element);
      if (this.unlocked.has(card.key)) this.unlock(card.element);
      else this.lock(card, settings);
    }
    for (const element of this.locks.keys()) if (!seen.has(element)) this.unlock(element);
  }

  private lock(card: Card, settings: UnfrySettings) {
    const thumb = card.element.querySelector<HTMLElement>(thumbSelector);
    if (!thumb) return;
    const { title, duration } = describe(card.element);
    const signature = `${card.key}:${title}:${duration}:${settings.unfryHoldMs}`;
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
      // The title and channel are printed beside the thumbnail already.
      title: title || 'Video',
      facts: duration ? [duration] : [],
      holdMs: settings.unfryHoldMs,
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
}
