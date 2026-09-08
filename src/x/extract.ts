import { threadId } from '../common/post';
import type { Post } from '../common/post';

export const articleSelector = 'article[data-testid="tweet"]';
const authorSelector = '[data-testid="User-Name"]';
const handlePattern = /^\/([A-Za-z0-9_]{1,15})$/;

export function author(scope: Element) {
  const container = scope.matches(authorSelector) ? scope : scope.querySelector(authorSelector);
  for (const link of container?.querySelectorAll('a[href^="/"]') ?? []) {
    const handle = handlePattern.exec(link.getAttribute('href') ?? '')?.[1];
    if (handle)
      return { handle, name: container?.querySelector('a span')?.textContent?.trim() || handle };
  }
  return { handle: '', name: '' };
}

export function text(article: Element): string {
  // textContent is stable even when our stylesheet hides the post.
  return [...article.querySelectorAll('[data-testid="tweetText"]')]
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean)
    .join('\n—\n');
}

export function postId(article: Element): string {
  for (const time of article.querySelectorAll('time')) {
    const link = time.closest('a');
    if (!link || link.closest('div[role="link"]')) continue;
    const id = /\/status\/(\d+)(?:\/|$)/.exec(link.getAttribute('href') ?? '')?.[1];
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
    '[data-testid="tweetPhoto"] img, [data-testid="previewInterstitial"] img, [data-testid^="card."] img',
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

export function isThreadContext(article: Element, focal: Element | null): boolean {
  if (!focal || !article.isConnected || !focal.isConnected) return false;
  if (article === focal) return true;
  const position = focal.compareDocumentPosition(article);
  return (
    !(position & Node.DOCUMENT_POSITION_DISCONNECTED) &&
    Boolean(position & Node.DOCUMENT_POSITION_PRECEDING)
  );
}

export function reposter(article: Element): string {
  const context = article.querySelector('[data-testid="socialContext"]');
  const link = context?.querySelector('a[href^="/"]') ?? context?.closest('a[href^="/"]');
  return handlePattern.exec(link?.getAttribute('href') ?? '')?.[1] ?? '';
}

function parentContext(article: Element, focal: Element | null): string {
  const targets = [...article.querySelectorAll('a[href^="/"]')]
    .filter(
      (link) =>
        !link.closest(
          `${authorSelector}, [data-testid="tweetText"], div[role="link"], [data-testid="socialContext"], .aitf-slot`,
        ),
    )
    .map((link) => handlePattern.exec(link.getAttribute('href') ?? '')?.[1]?.toLowerCase());
  const previous = article
    .closest('[data-testid="cellInnerDiv"]')
    ?.previousElementSibling?.querySelector(articleSelector);
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

/** X mounts far more posts than it shows. Only touch the ones the reader is at
 *  or scrolling towards: collapsing anything above the fold moves the page under
 *  them, and X re-measures the whole column when a cell changes height. */
export function nearViewport(article: Element): boolean {
  const rect = article.getBoundingClientRect();
  const height = window.innerHeight || 800;
  return rect.bottom > 0 && rect.top < height * 2;
}

export const currentThread = () => threadId(location.pathname);
