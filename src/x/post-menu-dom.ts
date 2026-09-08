// Desktop X portals its post dropdown into #layers. No generated class names or
// translated labels are used for selection. Unknown layouts are left untouched.
export const moreSelector = '[data-testid="caret"]';
export const dropdownSelector = '[data-testid="Dropdown"]';
const itemSelector = '[role="menuitem"]';

export function visible(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

/** The rendered menu is the source of truth, including when its click was missed
 * or its originating article has been virtualized away. */
export function menuPost(dropdown: HTMLElement): { id: string; handle: string } | null {
  if (!dropdown.closest('[role="menu"]') || !visible(dropdown)) return null;
  const links = dropdown.querySelectorAll<HTMLAnchorElement>('a[data-testid="tweetEngagements"]');
  if (links.length !== 1) return null;
  let url: URL;
  try {
    url = new URL(links[0]!.getAttribute('href') ?? '', 'https://x.com');
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !['x.com', 'twitter.com'].includes(url.hostname)) return null;
  const match = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)\/quotes\/?$/.exec(url.pathname);
  if (!match) return null;
  const handle = match[1]!;
  const id = match[2]!;
  const targets = [
    ...dropdown.querySelectorAll(
      '[data-testid="block"], [data-testid="mute"], [data-testid$="-follow"], [data-testid$="-unfollow"]',
    ),
  ];
  const handles = targets.flatMap((item) =>
    [...(item.textContent ?? '').matchAll(/@([A-Za-z0-9_]{1,15})(?![A-Za-z0-9_])/g)].map((match) =>
      match[1]!.toLowerCase(),
    ),
  );
  if (handles.some((target) => target !== handle.toLowerCase())) return null;
  return { id, handle };
}

export function nativeItems(dropdown: HTMLElement): HTMLElement[] {
  return [...dropdown.querySelectorAll<HTMLElement>(itemSelector)].filter(
    (item) => !item.closest('.aitf-post-menu'),
  );
}

export function matchMenuStyle(root: HTMLElement, sample: HTMLElement) {
  const row = getComputedStyle(sample);
  const label = getComputedStyle(sample.querySelector('[dir], span') ?? sample);
  // Sample typography from the actual menu, including X's selected font size/theme.
  root.style.fontFamily = label.fontFamily;
  root.style.fontSize = label.fontSize;
  root.style.fontWeight = label.fontWeight;
  root.style.lineHeight = label.lineHeight;
  root.style.color = label.color;
  root.style.setProperty('--aitf-menu-padding', row.padding || '12px 16px');
  const icon = sample.querySelector('svg');
  if (icon) {
    const width = getComputedStyle(icon).width;
    if (width && width !== 'auto') root.style.setProperty('--aitf-menu-icon-size', width);
  }
}

/** Handle only transitions involving our rows. X keeps control of its own rows. */
export function installMenuKeyboard(dropdown: HTMLElement, root: HTMLElement) {
  const keydown = (event: KeyboardEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !dropdown.contains(target)) return;
    const own = root.contains(target);
    if (own && (event.key === 'Enter' || event.key === ' ')) {
      // Leave the button's default activation intact, but not X's ancestor handlers.
      event.stopImmediatePropagation();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...dropdown.querySelectorAll<HTMLElement>(itemSelector)].filter(
      (item) => visible(item) && item.getAttribute('aria-disabled') !== 'true',
    );
    const index = items.findIndex((item) => item === target || item.contains(target));
    if (index < 0 || !items.length) return;
    const next =
      event.key === 'Home'
        ? items[0]
        : event.key === 'End'
          ? items[items.length - 1]
          : items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    if (next && (own || root.contains(next))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      next.focus();
    }
  };
  document.addEventListener('keydown', keydown, true);
  return () => document.removeEventListener('keydown', keydown, true);
}
