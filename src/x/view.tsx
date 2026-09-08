import { render } from 'preact';
import type { PublicSettings } from '../common/settings';
import { Mark } from './icons';

export type PostState =
  | { kind: 'show' }
  | { kind: 'pending' }
  | { kind: 'hidden'; name: string; reason: string; style: PublicSettings['hideStyle'] };

type Mounted = { root: HTMLDivElement; signature: string };
const mounted = new WeakMap<HTMLElement, Mounted>();
const signatureOf = (state: PostState) =>
  state.kind === 'hidden' ? `hidden:${state.style}:${state.name}:${state.reason}` : state.kind;

/** X puts its face on text elements, not on their containers, and the document
 *  default is a serif. Sample real text and refuse that fallback. */
export function typeface(scope: HTMLElement): string {
  const sample =
    scope.querySelector<HTMLElement>('[data-testid="tweetText"], [dir], span') ?? scope;
  const family = getComputedStyle(sample).fontFamily;
  return !family || /^\s*(?:serif\b|["']?Times)/i.test(family) ? '' : family;
}

function unmount(article: HTMLElement) {
  const previous = mounted.get(article);
  if (previous) {
    render(null, previous.root);
    previous.root.remove();
    mounted.delete(article);
  }
  delete article.dataset.aitfHidden;
}

export function reveal(article: HTMLElement) {
  unmount(article);
}

/** Lives inside the post, as its first child, with the post's own content
 *  switched off beside it. X measures the article it already knows about, so
 *  its virtualiser never sees a cell whose contents moved out from under it. */
export function apply(article: HTMLElement, state: PostState, onReveal: () => void) {
  const signature = signatureOf(state);
  const previous = mounted.get(article);
  if (state.kind === 'show') return unmount(article);
  if (
    previous?.root.isConnected &&
    previous.signature === signature &&
    previous.root.parentElement === article
  )
    return;
  unmount(article);
  const root = document.createElement('div');
  root.className = 'aitf-slot';
  const family = typeface(article);
  if (family) root.style.fontFamily = family;
  article.prepend(root);
  article.dataset.aitfHidden = state.kind === 'pending' ? 'pending' : state.style;
  mounted.set(article, { root, signature });

  if (state.kind === 'pending') {
    render(
      <div class="aitf-pending" role="status" aria-label="Checking this post">
        <span class="aitf-avatar" aria-hidden="true" />
        <span class="aitf-body" aria-hidden="true">
          <span class="aitf-headline" />
          <span class="aitf-line" />
          <span class="aitf-line short" />
        </span>
        <span class="aitf-spinner" aria-hidden="true" />
        <span class="aitf-glow" aria-hidden="true">
          <i />
        </span>
      </div>,
      root,
    );
    return;
  }

  render(
    <div class="aitf-banner">
      <Mark />
      <span class="aitf-banner-text">
        <span class="aitf-name">{state.name}</span>
        <span class="aitf-reason">{state.reason}</span>
      </span>
      <button
        type="button"
        class="aitf-show"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onReveal();
        }}
      >
        Show
      </button>
    </div>,
    root,
  );
}

export function restoreAll() {
  document.querySelectorAll<HTMLElement>('.aitf-slot').forEach((slot) => {
    const article = slot.parentElement;
    if (article) unmount(article);
    else slot.remove();
  });
}
