// The feed, dealt out a page at a time. One floating control at the foot of
// the window: back, where you are, forward. It is drawn into a node of its own
// under <body>, outside anything the site re-renders.
import { render } from 'preact';

export type PagerState = {
  /** 1-based. */
  page: number;
  hasPrev: boolean;
  /** The next page is known and ready. False while it is still loading. */
  hasNext: boolean;
  /** How many posts this page holds so far, and how many it will hold. */
  shown: number;
  size: number;
  onPrev: () => void;
  onNext: () => void;
};

function Pager({ page, hasPrev, hasNext, shown, size, onPrev, onNext }: PagerState) {
  const filling = shown < size;
  return (
    <nav class="aitf-pager" aria-label="Sharp pages">
      <button type="button" class="aitf-pager-step" disabled={!hasPrev} onClick={onPrev}>
        <span aria-hidden="true">‹</span>
        <span class="aitf-pager-word">Prev</span>
      </button>
      <span class="aitf-pager-where" aria-live="polite">
        Page {page}
        {filling && (
          <small>
            {' '}
            · {shown}/{size}
          </small>
        )}
      </span>
      <button
        type="button"
        class="aitf-pager-step"
        data-loading={!hasNext ? 'true' : undefined}
        onClick={onNext}
      >
        <span class="aitf-pager-word">{hasNext ? 'Next' : 'More'}</span>
        <span aria-hidden="true">›</span>
      </button>
    </nav>
  );
}

/** The pager is created with its controller, at document_start, before the
 *  page has a body; the body is looked up when there is something to draw. */
export function createPager(parent?: HTMLElement) {
  let root: HTMLElement | null = null;
  return {
    update(state: PagerState | null) {
      if (!state) {
        if (root) {
          render(null, root);
          root.remove();
          root = null;
        }
        return;
      }
      if (!root || !root.isConnected) {
        const host = parent ?? document.body;
        if (!host) return;
        root = document.createElement('div');
        root.className = 'aitf-pager-root';
        host.append(root);
      }
      render(<Pager {...state} />, root);
    },
    destroy() {
      this.update(null);
    },
  };
}
