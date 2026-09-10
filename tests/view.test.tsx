// @vitest-environment jsdom
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import * as view from '../src/x/view';

afterEach(() => {
  document.body.innerHTML = '';
});

function article() {
  document.body.innerHTML = `<div data-testid="cellInnerDiv"><article data-testid="tweet"><div>post body</div></article></div>`;
  return document.querySelector<HTMLElement>('article')!;
}

it('keeps a hidden post’s banner honest about a close call and about the author', () => {
  const node = article();
  const hidden = {
    kind: 'hidden' as const,
    name: 'Alice',
    reason: 'rage bait',
    unsure: true,
    style: 'collapse' as const,
    showAuthor: true,
  };
  act(() => view.apply(node, hidden, () => {}));
  expect(node.dataset.aitfHidden).toBe('collapse');
  expect(node.querySelector('.aitf-name')?.textContent).toBe('Alice');
  expect(node.querySelector('.aitf-mark-query')).not.toBeNull();
  expect(node.querySelector('.aitf-banner')?.getAttribute('data-unsure')).toBe('true');
  expect(node.parentElement?.hasAttribute('data-aitf-unsure')).toBe(true);
  act(() => view.apply(node, { ...hidden, unsure: false, showAuthor: false }, () => {}));
  expect(node.querySelector('.aitf-name')).toBeNull();
  expect(node.querySelector('.aitf-mark-query')).toBeNull();
  expect(node.parentElement?.hasAttribute('data-aitf-unsure')).toBe(false);
  act(() => view.apply(node, { ...hidden, unsure: false, style: 'remove' }, () => {}));
  expect(node.dataset.aitfHidden).toBe('remove');
  expect(node.querySelector('.aitf-banner')).toBeNull();
});

it('lets a revealed post overrule its verdict in place', async () => {
  const node = article();
  const setAllowed = vi.fn(async () => {});
  const setTaught = vi.fn(async () => {});
  let allowed = false;
  const recourse: view.Recourse = {
    handle: 'alice',
    status: () => ({ allowed, taught: false }),
    setAllowed,
    setTaught,
  };
  act(() => view.apply(node, { kind: 'revealed', recourse }, () => {}));
  expect(node.dataset.aitfHidden).toBeUndefined();
  const trigger = node.querySelector<HTMLButtonElement>('.aitf-show.quiet')!;
  expect(trigger.textContent).toBe('Wrong call?');
  expect(node.querySelector('.aitf-recourse-panel')).toBeNull();
  act(() => trigger.click());
  const checks = [...node.querySelectorAll<HTMLButtonElement>('.aitf-check')];
  expect(checks.map((check) => check.getAttribute('aria-checked'))).toEqual(['false', 'false']);
  await act(async () => {
    checks[0]!.click();
    await Promise.resolve();
  });
  expect(setAllowed).toHaveBeenCalledWith(true);
  expect(checks[0]!.getAttribute('aria-checked')).toBe('true');
  await act(async () => {
    checks[1]!.click();
    await Promise.resolve();
  });
  expect(setTaught).toHaveBeenCalledWith(true);
  // Re-applying the same state must not close the disclosure under the reader.
  allowed = true;
  act(() => view.apply(node, { kind: 'revealed', recourse }, () => {}));
  expect(node.querySelector('.aitf-recourse-panel')).not.toBeNull();
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
  expect(node.querySelector('.aitf-recourse-panel')).toBeNull();
});

it('dresses X’s feedback card as the post it replaced, and can undo it', () => {
  document.body.innerHTML = `<div data-testid="cellInnerDiv"><div>
    Thanks. X will use this. Show fewer posts from Alice. <div role="button">Undo</div>
  </div></div>`;
  const cell = document.querySelector<HTMLElement>('[data-testid="cellInnerDiv"]')!;
  const onUndo = vi.fn();
  const state = {
    style: 'collapse' as const,
    name: 'Alice',
    reason: 'rage bait',
    showAuthor: false,
    acked: false,
    onUndo,
  };
  act(() => view.applyFeedback(cell, state));
  expect(cell.dataset.aitfHidden).toBe('collapse');
  expect(cell.querySelector('.aitf-name')).toBeNull();
  expect(cell.querySelector('.aitf-told')?.textContent).toBe('Telling X');
  expect(cell.querySelector('.aitf-dot')).not.toBeNull();
  expect(cell.querySelector('.aitf-show')).toBeNull();
  act(() => view.applyFeedback(cell, { ...state, acked: true }));
  expect(cell.querySelector('.aitf-told')?.textContent).toBe('Told X');
  act(() => cell.querySelector<HTMLButtonElement>('.aitf-show')!.click());
  expect(onUndo).toHaveBeenCalledTimes(1);
  act(() => view.applyFeedback(cell, { ...state, style: 'remove' }));
  expect(cell.dataset.aitfHidden).toBe('remove');
  expect(cell.querySelector('.aitf-banner')).toBeNull();
  act(() => view.clearFeedback(cell));
  expect(cell.dataset.aitfHidden).toBeUndefined();
  expect(cell.querySelector('.aitf-slot')).toBeNull();
});
