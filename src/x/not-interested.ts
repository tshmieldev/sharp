import { dropdownSelector, moreSelector, visible } from './post-menu-dom';

// X learns from "Not interested" the way it learns from a scroll-past, so a
// hidden post can also teach the ranking that produced it. This opens the post's
// own menu and chooses that item; nothing else in the menu is touched.
const OPEN_TIMEOUT = 1500;
const CLOSE_TIMEOUT = 1000;
const POLL = 30;
// One menu can be open at a time, so reports are serial; the gap between them
// only keeps X's portal from being reopened before it has finished closing.
const SPACING = 200;
const MAX_PER_TAB = 400;
const MAX_FAILURES = 3;
const label = /not interested in this post/i;

// A report costs X a menu mount and unmount, and opening a menu closes any the
// reader has open. Never spend that while the reader is scrolling or has a
// menu or dialog up anywhere, and otherwise take it from idle time.
const busySelector = `#layers ${dropdownSelector}, #layers [role="menu"], #layers [role="dialog"]`;
const readerBusy = () => [...document.querySelectorAll<HTMLElement>(busySelector)].some(visible);
const SCROLL_SETTLE = 250;
const IDLE_TIMEOUT = 1000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const idle = () =>
  new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === 'function')
      requestIdleCallback(() => resolve(), { timeout: IDLE_TIMEOUT });
    else setTimeout(resolve, 50);
  });
const clickable = (element: Element | null): element is HTMLElement =>
  element instanceof HTMLElement;

/** The dropdown for exactly this post, visible or not: the stylesheet hides it
 *  while the extension drives it, which the menu adapter reads as "no menu". */
function dropdownFor(id: string): HTMLElement | null {
  for (const dropdown of document.querySelectorAll<HTMLElement>(`#layers ${dropdownSelector}`)) {
    const links = dropdown.querySelectorAll('a[data-testid="tweetEngagements"]');
    if (links.length !== 1) continue;
    const href = links[0]!.getAttribute('href') ?? '';
    if (new RegExp(`/status/${id}/quotes/?$`).test(href)) return dropdown;
  }
  return null;
}

async function until<T>(probe: () => T | null, timeout: number): Promise<T | null> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = probe();
    if (found) return found;
    await sleep(POLL);
  }
  return null;
}

export class NotInterested {
  /** X may swap the post for its feedback card synchronously inside the click,
   *  so whoever wants the spot must take it in `before`, while the post is
   *  still in the page. `after` runs once the click has been delivered. */
  constructor(
    private readonly hooks: {
      before?: (article: HTMLElement, id: string) => void;
      after?: (id: string) => void;
    } = {},
  ) {}

  private queue: { article: HTMLElement; id: string }[] = [];
  private done = new Set<string>();
  private busy = false;
  private failures = 0;
  private sent = 0;
  private stopped = false;
  private scrolledAt = 0;
  private readonly onScroll = () => {
    this.scrolledAt = Date.now();
  };
  private listening = false;

  private async quiet() {
    if (!this.listening) {
      this.listening = true;
      window.addEventListener('scroll', this.onScroll, { passive: true, capture: true });
    }
    while (!this.stopped && (Date.now() - this.scrolledAt < SCROLL_SETTLE || readerBusy()))
      await sleep(SCROLL_SETTLE);
    await idle();
  }

  /** Idempotent per post identity within a tab. */
  request(article: HTMLElement, id: string) {
    if (this.stopped || this.done.has(id) || this.queue.some((item) => item.id === id)) return;
    if (this.failures >= MAX_FAILURES || this.sent >= MAX_PER_TAB) return;
    this.queue.push({ article, id });
    void this.pump();
  }

  stop() {
    this.stopped = true;
    this.queue = [];
    if (this.listening) window.removeEventListener('scroll', this.onScroll, { capture: true });
    this.listening = false;
    delete document.documentElement.dataset.aitfAuto;
  }

  private async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (!this.stopped && this.queue.length) {
        await this.quiet();
        if (this.stopped) break;
        const item = this.queue.shift()!;
        this.done.add(item.id);
        // Still mounted, still hidden, still the same post: never act on a recycled node.
        const hidden = item.article.dataset.aitfHidden;
        if (
          !item.article.isConnected ||
          (hidden !== 'collapse' && hidden !== 'blur' && hidden !== 'remove') ||
          !item.article.querySelector(`a[href*="/status/${item.id}"]`)
        )
          continue;
        const caret = item.article.querySelector(moreSelector);
        if (!clickable(caret)) continue;
        await this.report(item.article, caret, item.id);
        await sleep(SPACING);
      }
    } finally {
      this.busy = false;
    }
  }

  private async report(article: HTMLElement, caret: HTMLElement, id: string) {
    document.documentElement.dataset.aitfAuto = '';
    try {
      caret.click();
      const dropdown = await until(() => dropdownFor(id), OPEN_TIMEOUT);
      if (!dropdown) return;
      const item = [...dropdown.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((node) =>
        label.test(node.textContent ?? ''),
      );
      if (item) {
        this.hooks.before?.(article, id);
        item.click();
        this.sent++;
        this.failures = 0;
        this.hooks.after?.(id);
      } else {
        // Most likely a non-English interface. Close what was opened and back off.
        this.failures++;
        dropdown.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
        );
      }
      await until(() => (dropdown.isConnected ? null : true), CLOSE_TIMEOUT);
    } finally {
      delete document.documentElement.dataset.aitfAuto;
    }
  }
}
