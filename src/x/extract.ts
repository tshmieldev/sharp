import { threadId } from '../common/post';
import type { Post } from '../common/post';

// X serves two clients. The old one (React Native Web, `#react-root`) labels
// everything with data-testid. The one rolled out in November 2026 has no test
// ids at all: a timeline is `[id^="urt:"] > ul` of absolutely positioned,
// virtualised `li` rows, each post an `article` inside a `[role="link"]`
// wrapper that carries the permalink in `data-href`, the author in
// `[data-post-avatar]`, the text in `div[dir="auto"]`, media behind
// `[data-engagement-action="media"]`, and a quoted post in an
// `[data-slot="embedded-tweet-frame"]` frame. Every reader below tries the old
// labels first and the new shapes second, so one build serves whichever client
// a reader is given.

/** A quoted post's frame. Nothing inside it belongs to the post around it. */
const frameSelector = '[data-slot="embedded-tweet-frame"]';
const modernArticle = `[id^="urt:"] > ul > li article:not(${frameSelector} article)`;
export const articleSelector = `article[data-testid="tweet"], ${modernArticle}`;
/** The timeline row a post sits in. X recycles and swaps these. */
export const cellSelector = '[data-testid="cellInnerDiv"], [id^="urt:"] > ul > li';
const authorSelector = '[data-testid="User-Name"]';
const handlePattern = /^\/([A-Za-z0-9_]{1,15})$/;
const statusPattern = /\/status\/(\d+)(?:\/|$)/;

/** Whether the page is the rebuilt client. False until the page has a body. */
export const modernClient = () => Boolean(document.body) && !document.getElementById('react-root');

export const cellOf = (article: Element) => article.closest<HTMLElement>(cellSelector);

const inFrame = (node: Element, scope: Element) => {
  const frame = node.closest(frameSelector);
  return frame !== null && scope.contains(frame) && frame !== scope;
};

export function author(scope: Element) {
  const container = scope.matches(authorSelector) ? scope : scope.querySelector(authorSelector);
  for (const link of container?.querySelectorAll('a[href^="/"]') ?? []) {
    const handle = handlePattern.exec(link.getAttribute('href') ?? '')?.[1];
    if (handle)
      return { handle, name: container?.querySelector('a span')?.textContent?.trim() || handle };
  }
  // The rebuilt client: the avatar links to the author, and the name block
  // repeats the link with the display name in it.
  const avatar = [...scope.querySelectorAll('[data-post-avatar] a[href^="/"]')].find(
    (link) => !inFrame(link, scope),
  );
  const handle = handlePattern.exec(avatar?.getAttribute('href') ?? '')?.[1];
  if (handle) {
    const named = [...scope.querySelectorAll<HTMLElement>(`.x-middot-group a[href="/${handle}"]`)]
      .filter((link) => !inFrame(link, scope))
      .map((link) => link.textContent?.trim() ?? '')
      .find((label) => label && !label.startsWith('@'));
    return { handle, name: named || handle };
  }
  return { handle: '', name: '' };
}

/** The post's own words, then any quoted post's, the way the reader sees them. */
export function text(article: Element): string {
  const labelled = [...article.querySelectorAll('[data-testid="tweetText"]')];
  const nodes = labelled.length ? labelled : modernText(article);
  return nodes
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean)
    .join('\n—\n');
}

function modernText(article: Element): Element[] {
  const candidates = [...article.querySelectorAll('div[dir="auto"]')].filter(
    (node) => !node.closest('[role="group"], .x-middot-group, a'),
  );
  // Counts, names and card captions also read right-to-left when they must;
  // the body is the block that keeps the author's line breaks. Should that
  // marker go, every free-standing block is better than nothing.
  const bodies = candidates.filter((node) => node.classList.contains('whitespace-pre-wrap'));
  const chosen = bodies.length ? bodies : candidates;
  return [
    ...chosen.filter((node) => !inFrame(node, article)),
    ...chosen.filter((node) => inFrame(node, article)),
  ];
}

export function postId(article: Element): string {
  for (const time of article.querySelectorAll('time')) {
    const link = time.closest('a');
    if (!link || link.closest('div[role="link"]')) continue;
    const id = statusPattern.exec(link.getAttribute('href') ?? '')?.[1];
    if (id) return id;
  }
  // The rebuilt client: the row wrapper names the post; a focused post has no
  // wrapper and names itself through its timestamp link.
  const wrapper = article.closest('[role="link"][data-href]');
  const wrapped = wrapper && !inFrame(wrapper, article) ? wrapper.getAttribute('data-href') : null;
  const fromWrapper = statusPattern.exec(wrapped ?? '')?.[1];
  if (fromWrapper) return fromWrapper;
  for (const link of article.querySelectorAll('a[href*="/status/"]')) {
    if (inFrame(link, article) || link.getAttribute('aria-hidden') === 'true') continue;
    const href = link.getAttribute('href') ?? '';
    if (/\/(?:photo|video|analytics|quotes|retweets|likes)\b/.test(href)) continue;
    const id = statusPattern.exec(href)?.[1];
    if (id) return id;
  }
  return '';
}

export function smallImage(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'pbs.twimg.com') return '';
    if (parsed.searchParams.has('name')) parsed.searchParams.set('name', 'small');
    return parsed.toString();
  } catch {
    return '';
  }
}

export function images(article: Element, max: number): string[] {
  if (max <= 0) return [];
  const photos = article.querySelectorAll<HTMLImageElement>(
    '[data-testid="tweetPhoto"] img, [data-testid="previewInterstitial"] img, [data-testid^="card."] img, [data-engagement-action="media"] img',
  );
  const videos = article.querySelectorAll<HTMLVideoElement>('video[poster]');
  return [
    ...new Set(
      [
        ...[...photos].map((image) => smallImage(image.src)),
        ...[...videos].map((video) => smallImage(video.poster)),
      ].filter(Boolean),
    ),
  ].slice(0, max);
}

export function focalArticle(id: string): HTMLElement | null {
  if (!id) return null;
  return (
    [...document.querySelectorAll<HTMLElement>(articleSelector)].find(
      (article) => postId(article) === id,
    ) ?? null
  );
}

/** Where a row sits in its timeline. The rebuilt client positions rows
 *  absolutely and reuses nodes, so document order says nothing; the index does. */
function rowIndex(article: Element): number | null {
  const index = cellOf(article)?.getAttribute('data-index');
  return index === null || index === undefined ? null : Number(index);
}

export function isThreadContext(article: Element, focal: Element | null): boolean {
  if (!focal || !article.isConnected || !focal.isConnected) return false;
  if (article === focal) return true;
  const own = rowIndex(article);
  const anchor = rowIndex(focal);
  if (own !== null && anchor !== null) return own < anchor;
  const position = focal.compareDocumentPosition(article);
  return (
    !(position & Node.DOCUMENT_POSITION_DISCONNECTED) &&
    Boolean(position & Node.DOCUMENT_POSITION_PRECEDING)
  );
}

/** The header above a reposted post, naming who reposted it. */
function socialContext(article: Element): Element | null {
  const labelled = article.querySelector('[data-testid="socialContext"]');
  if (labelled) return labelled;
  // The rebuilt client draws it with a repost icon, either as the article's
  // first block or just before the article inside its row.
  let first = article.firstElementChild;
  if (first?.classList.contains('aitf-slot')) first = first.nextElementSibling;
  const own = socialOf(first);
  if (own) return own;
  let before = article.previousElementSibling;
  if (before?.matches('a[aria-hidden="true"]')) before = before.previousElementSibling;
  return socialOf(before);
}
function socialOf(block: Element | null): Element | null {
  if (!block || block.querySelector('[data-post-avatar]')) return null;
  const icon = block.querySelector('svg[data-icon]')?.getAttribute('data-icon') ?? '';
  const words = block.textContent?.trim() ?? '';
  return /repost|retweet/i.test(icon) || /\b(?:reposted|retweeted)\b/i.test(words) ? block : null;
}

export function reposter(article: Element): string {
  const context = socialContext(article);
  const link = context?.querySelector('a[href^="/"]') ?? context?.closest('a[href^="/"]');
  return handlePattern.exec(link?.getAttribute('href') ?? '')?.[1] ?? '';
}

/** The row drawn just above this one, whichever client drew it. */
function previousArticle(article: Element): Element | null {
  const cell = cellOf(article);
  if (!cell) return null;
  const index = rowIndex(article);
  if (index !== null && cell.parentElement) {
    const previous = cell.parentElement.querySelector(`:scope > li[data-index="${index - 1}"]`);
    return previous?.querySelector(articleSelector) ?? null;
  }
  return cell.previousElementSibling?.querySelector(articleSelector) ?? null;
}

function parentContext(article: Element, focal: Element | null): string {
  const targets = [...article.querySelectorAll('a[href^="/"]')]
    .filter(
      (link) =>
        !inFrame(link, article) &&
        !link.closest(
          `${authorSelector}, [data-testid="tweetText"], div[role="link"], [data-testid="socialContext"], [data-post-avatar], .x-middot-group, .aitf-slot`,
        ),
    )
    .map((link) => handlePattern.exec(link.getAttribute('href') ?? '')?.[1]?.toLowerCase());
  const previous = previousArticle(article);
  const parent =
    previous && targets.includes(author(previous).handle.toLowerCase())
      ? previous
      : isThreadContext(article, focal)
        ? null
        : focal;
  return parent && text(parent) ? `@${author(parent).handle}: ${text(parent).slice(0, 500)}` : '';
}

export function describe(article: Element, imageLimit: number, focal: Element | null): Post | null {
  const { handle } = author(article);
  const id = postId(article);
  // Wait for the timestamp/author rather than inventing an identity for a half-mounted tweet.
  if (!handle || !id) return null;
  return {
    key: id,
    handle,
    text: text(article).slice(0, 30000),
    images: images(article, imageLimit),
    context: parentContext(article, focal),
  };
}

/** X mounts far more posts than it shows, and judging all of them costs money
 *  for posts nobody reaches. The runway either side of the viewport is the
 *  reader's own lookahead setting, as a percentage of a screen. */
export function nearViewport(article: Element, lookahead: number): boolean {
  const rect = article.getBoundingClientRect();
  const viewport = window.innerHeight || 800;
  const margin = (viewport * lookahead) / 100;
  return rect.bottom > -margin && rect.top < viewport + margin;
}

export const currentThread = () => threadId(location.pathname);
