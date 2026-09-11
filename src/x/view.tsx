import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { PublicSettings } from '../common/settings';
import { Check, Mark, Query } from './icons';
import { articleSelector } from './extract';

export type HiddenStyle = PublicSettings['hideStyle'] | 'remove';
/** What the reader can do about a verdict they have already overruled by revealing. */
export type Recourse = {
  handle: string;
  status: () => { allowed: boolean; taught: boolean };
  setAllowed: (allowed: boolean) => Promise<unknown>;
  setTaught: (taught: boolean) => Promise<unknown>;
};
export type PostState =
  | { kind: 'show' }
  | { kind: 'pending' }
  | {
      kind: 'hidden';
      name: string;
      reason: string;
      unsure: boolean;
      style: HiddenStyle;
      showAuthor: boolean;
      /** Reported to X over the wire: in flight, or acknowledged. */
      told?: 'sending' | 'told';
    }
  | { kind: 'revealed'; recourse: Recourse };

/** A post's cell from the moment Sharp tells X "not interested" until X has
 *  recycled it. X answers by drawing a "Thanks, we'll show fewer posts like
 *  this" card there, which names the author; the cell stays dressed as the
 *  hidden post throughout, so the card is never painted. */
export type FeedbackState = {
  style: HiddenStyle;
  name: string;
  reason: string;
  showAuthor: boolean;
  /** X has answered; its Undo is available. */
  acked: boolean;
  onUndo: () => void;
};

const cellSelector = '[data-testid="cellInnerDiv"]';
type Mounted = { root: HTMLDivElement; signature: string };
const mounted = new WeakMap<HTMLElement, Mounted>();
const signatureOf = (state: PostState) =>
  state.kind === 'hidden'
    ? `hidden:${state.style}:${state.showAuthor ? state.name : ''}:${state.reason}:${state.unsure}:${state.told ?? ''}`
    : state.kind === 'revealed'
      ? `revealed:${state.recourse.handle}`
      : state.kind;

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
  delete article.dataset.aitfRevealed;
  article.closest<HTMLElement>(cellSelector)?.removeAttribute('data-aitf-unsure');
}

export function reveal(article: HTMLElement) {
  unmount(article);
}

/** A revealed post keeps a quiet handle on the verdict it overruled. Opening it
 *  discloses the two things worth doing about a wrong call, in place, without
 *  a modal and without leaving the post. */
function Recourse({ recourse }: { recourse: Recourse }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(recourse.status);
  const [busy, setBusy] = useState<'allowed' | 'taught' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStatus(recourse.status());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, recourse]);

  async function toggle(which: 'allowed' | 'taught') {
    if (busy) return;
    setBusy(which);
    setError('');
    const next = !status[which];
    try {
      await (which === 'allowed' ? recourse.setAllowed(next) : recourse.setTaught(next));
      setStatus((current) => ({ ...current, [which]: next }));
    } catch {
      setError('Could not save. Try again or reload the extension.');
    } finally {
      setBusy(null);
    }
  }

  const rows = [
    {
      key: 'allowed' as const,
      label: `Never filter @${recourse.handle}`,
      hint: 'Their posts skip every rule and the model.',
    },
    {
      key: 'taught' as const,
      label: 'Keep posts like this',
      hint: 'Goes to the model as an example with every batch.',
    },
  ];

  return (
    <div class="aitf-recourse" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        class="aitf-show quiet"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <Mark />
        <span>Wrong call?</span>
      </button>
      {open && (
        <div
          class="aitf-recourse-panel"
          role="group"
          aria-label="Sharp"
          onClick={(event) => event.stopPropagation()}
        >
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              role="checkbox"
              class="aitf-check"
              aria-checked={status[row.key]}
              aria-disabled={busy !== null}
              onClick={(event) => {
                event.preventDefault();
                void toggle(row.key);
              }}
            >
              <span class="aitf-check-box" aria-hidden="true">
                <Check />
              </span>
              <span class="aitf-check-text">
                <span>{row.label}</span>
                <small>{row.hint}</small>
              </span>
            </button>
          ))}
          {error && (
            <p class="aitf-thread-note" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
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
  if (state.kind === 'revealed') article.dataset.aitfRevealed = '';
  else article.dataset.aitfHidden = state.kind === 'pending' ? 'pending' : state.style;
  // The tint belongs to the cell: the article sits inside X's padding.
  if (state.kind === 'hidden' && state.unsure)
    article.closest<HTMLElement>(cellSelector)?.setAttribute('data-aitf-unsure', '');
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
        <span class="aitf-glow" aria-hidden="true">
          <i />
        </span>
      </div>,
      root,
    );
    return;
  }

  if (state.kind === 'revealed') {
    render(<Recourse recourse={state.recourse} />, root);
    return;
  }

  // Fully hidden posts draw nothing: the stylesheet takes the article out of flow.
  if (state.style === 'remove') return;

  render(
    <div class="aitf-banner" data-unsure={state.unsure ? 'true' : undefined}>
      {state.unsure ? <Query /> : <Mark />}
      <span class="aitf-banner-text">
        {state.showAuthor && <span class="aitf-name">{state.name}</span>}
        {state.showAuthor && <span class="aitf-sep" aria-hidden="true" />}
        <span class="aitf-reason">{state.reason}</span>
      </span>
      {state.told && (
        <span class="aitf-told" role="status">
          {state.told === 'told' ? <Check /> : <span class="aitf-dot" aria-hidden="true" />}
          {state.told === 'told' ? 'Told X' : 'Telling X'}
        </span>
      )}
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

export function applyFeedback(cell: HTMLElement, state: FeedbackState) {
  const signature = `feedback:${state.style}:${state.showAuthor ? state.name : ''}:${state.reason}:${state.acked}`;
  const previous = mounted.get(cell);
  if (
    previous?.root.isConnected &&
    previous.signature === signature &&
    previous.root.parentElement === cell
  )
    return;
  unmount(cell);
  const root = document.createElement('div');
  root.className = 'aitf-slot';
  const family = typeface(cell);
  if (family) root.style.fontFamily = family;
  // A post's banner sits inside the article, behind X's own inset; the cell has
  // none, so borrow the inset from any article still on the page to line up.
  const reference = document.querySelector<HTMLElement>(articleSelector);
  if (reference) root.style.setProperty('--aitf-inset', getComputedStyle(reference).paddingLeft);
  cell.prepend(root);
  cell.dataset.aitfHidden = state.style;
  mounted.set(cell, { root, signature });
  if (state.style !== 'remove') renderFeedback(root, state);
}

function renderFeedback(root: HTMLElement, state: FeedbackState) {
  render(
    <div class="aitf-banner aitf-banner-cell" data-acked={state.acked ? 'true' : 'false'}>
      <Mark />
      <span class="aitf-banner-text">
        {state.showAuthor && <span class="aitf-name">{state.name}</span>}
        {state.showAuthor && <span class="aitf-sep" aria-hidden="true" />}
        <span class="aitf-reason">{state.reason}</span>
      </span>
      <span class="aitf-told" role="status">
        {state.acked ? <Check /> : <span class="aitf-dot" aria-hidden="true" />}
        {state.acked ? 'Told X' : 'Telling X'}
      </span>
      {state.acked && (
        <button
          type="button"
          class="aitf-show"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            state.onUndo();
          }}
        >
          Undo
        </button>
      )}
    </div>,
    root,
  );
}

export function clearFeedback(cell: HTMLElement) {
  unmount(cell);
}

export function restoreAll() {
  document.querySelectorAll<HTMLElement>('.aitf-slot').forEach((slot) => {
    const article = slot.parentElement;
    if (article) unmount(article);
    else slot.remove();
  });
}
