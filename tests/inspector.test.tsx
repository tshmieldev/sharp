// @vitest-environment jsdom
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import * as view from '../src/x/view';
import { closeInspector, openInspector } from '../src/x/inspector';
import type { Verdict } from '../src/common/post';

afterEach(() => {
  act(closeInspector);
  document.body.innerHTML = '';
});

function article() {
  document.body.innerHTML = `<div data-testid="cellInnerDiv"><article data-testid="tweet"><div>post body</div></article></div>`;
  return document.querySelector<HTMLElement>('article')!;
}
const hidden = {
  kind: 'hidden' as const,
  name: 'Alice',
  reason: 'Matches your filter',
  style: 'collapse' as const,
  showAuthor: true,
};

it('says how sure it is of the hide, never a bare figure or a model name', () => {
  const node = article();
  act(() => view.apply(node, { ...hidden, unsure: false, score: 0.93, threshold: 0.8 }, () => {}));
  const confidence = node.querySelector('.aitf-banner-text .aitf-confidence')!;
  expect(confidence.textContent).toBe('93% sure');
  expect(node.querySelector('.aitf-banner-text')?.textContent).toContain('Hidden93% sure');
  expect(confidence.getAttribute('title')).toBe(
    '93% sure this post matches your filter, so it is hidden.',
  );
  expect(confidence.textContent).not.toMatch(/match/i);
  expect(confidence.hasAttribute('data-unsure')).toBe(false);
  expect(node.textContent).not.toMatch(/jev|typesafe/i);
});

it('says “only” for a hide under the reader’s line', () => {
  const node = article();
  act(() => view.apply(node, { ...hidden, unsure: true, score: 0.66, threshold: 0.8 }, () => {}));
  const confidence = node.querySelector('.aitf-confidence')!;
  expect(confidence.getAttribute('data-unsure')).toBe('true');
  expect(confidence.textContent).toBe('only 66% sure');
  expect(confidence.getAttribute('title')).toContain('under your 80% line');
  expect(node.parentElement?.hasAttribute('data-aitf-unsure')).toBe(true);
});

it('leaves a chat model’s banner as it was: a reason, no scale, no inspector', () => {
  const node = article();
  act(() => view.apply(node, { ...hidden, reason: 'rage bait', unsure: false }, () => {}));
  expect(node.querySelector('.aitf-confidence')).toBeNull();
  expect(node.querySelector('.aitf-inspect')).toBeNull();
});

it('in debug mode marks kept posts too, and every mark opens the inspector', () => {
  const node = article();
  const inspect = vi.fn();
  act(() => view.apply(node, { kind: 'kept', score: 0.12, inspect }, () => {}));
  expect(node.hasAttribute('data-aitf-kept')).toBe(true);
  expect(node.querySelector('.aitf-kept')?.textContent).toBe('Kept88% sure');
  act(() => node.querySelector<HTMLButtonElement>('.aitf-inspect')!.click());
  expect(inspect).toHaveBeenCalledOnce();
  act(() => view.apply(node, { kind: 'show' }, () => {}));
  expect(node.hasAttribute('data-aitf-kept')).toBe(false);
});

const verdict: Verdict = {
  key: '1',
  hide: true,
  reason: 'Matches your filter',
  score: 0.93,
  trace: {
    source: 'classifier',
    model: 'typesafe/jev-1.13',
    at: Date.now(),
    totalMs: 1480,
    requestMs: 212,
    tokens: 318,
    images: [
      {
        url: 'https://pbs.twimg.com/media/a.jpg',
        model: 'google/gemini-2.5-flash-lite',
        description: 'Text: "BUY NOW"',
        ms: 1190,
        cached: false,
      },
    ],
    request: { state: { post: { text: 'kinda brutal Apple' } } },
    response: { answers: { hide: { noul: 0.93 } } },
  },
};
const entry = {
  post: { key: '1', handle: 'thenerd_be', text: 'kinda brutal Apple', images: [], context: '' },
  name: 'Frederik Jacques',
  verdict,
  threshold: 0.8,
  hideFrom: 0.5,
  unsure: false,
};

it('opens everything behind a decision beside the timeline, and swaps on the next post', () => {
  act(() => openInspector(entry));
  const panel = document.querySelector('.aitf-inspector')!;
  expect(panel.querySelector('.aitf-verdict strong')?.textContent).toBe('Hidden');
  expect(panel.querySelector('.aitf-verdict-likely')?.textContent).toBe('93% sure');
  const lanes = [...panel.querySelectorAll('.aitf-waterfall li')].map((row) => row.textContent);
  expect(lanes).toEqual(['Image 11.19 s', 'Decision212 ms', 'Total1.48 s']);
  expect(panel.querySelector<HTMLImageElement>('.aitf-images img')!.src).toBe(
    'https://pbs.twimg.com/media/a.jpg',
  );
  expect(panel.textContent).toContain('"kinda brutal Apple"');
  expect(panel.textContent).toContain('"noul": 0.93');

  act(() => openInspector({ ...entry, verdict: { ...verdict, hide: false, score: 0.1 } }));
  expect(document.querySelectorAll('.aitf-inspector')).toHaveLength(1);
  expect(document.querySelector('.aitf-verdict strong')?.textContent).toBe('Kept');

  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
  expect(document.querySelector('.aitf-inspector')).toBeNull();
});

it('says when a decision came from the cache, and when there is nothing to show', () => {
  act(() =>
    openInspector({
      ...entry,
      verdict: { ...verdict, trace: { source: 'cache', model: '', at: Date.now(), images: [] } },
    }),
  );
  expect(document.querySelector('.aitf-inspector')?.textContent).toContain('From cache');
  expect(document.querySelector('.aitf-waterfall')).toBeNull();
  const { trace: _dropped, ...untraced } = verdict;
  act(() => openInspector({ ...entry, verdict: untraced }));
  expect(document.querySelector('.aitf-inspector')?.textContent).toContain('No trace');
});

it('is sure of what it did: a hide by its score, a keep by the rest', () => {
  expect(view.sureText(0.93, false)).toBe('93% sure');
  expect(view.sureText(0.62, true)).toBe('only 62% sure');
  // A post scored 12% was kept, and Sharp is 88% sure of that.
  expect(view.sureText(0.12, false)).toBe('88% sure');
  expect(view.sureText(0.3, false, 0.2)).toBe('30% sure');
  expect(view.explainScore(0.12)).toBe(
    '88% sure this post is fine. It scored 12%, under your 50% hide line, so it stays.',
  );
  expect(view.explainScore(0.62)).toContain('Only 62% sure this post matches your filter.');
});
