// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NotInterested } from '../src/x/not-interested';

const id = '2096980473754866081';
let chosen: string[] = [];

function mountTimeline(items: string[]) {
  document.body.innerHTML = `<div id="layers"></div>
    <div data-testid="cellInnerDiv"><div>
    <article data-testid="tweet" data-aitf-hidden="collapse">
      <a href="/alice/status/${id}"><time></time></a>
      <button data-testid="caret">More</button>
    </article></div></div>`;
  const layers = document.getElementById('layers')!;
  document.querySelector<HTMLElement>('[data-testid="caret"]')!.addEventListener('click', () => {
    // X portals a menu whose engagement link names the post; items are plain text.
    layers.innerHTML = `<div role="menu"><div data-testid="Dropdown">
      ${items.map((text) => `<div role="menuitem"><span>${text}</span></div>`).join('')}
      <a role="menuitem" data-testid="tweetEngagements" href="/alice/status/${layers.dataset.id ?? id}/quotes">Views</a>
    </div></div>`;
    for (const item of layers.querySelectorAll<HTMLElement>('div[role="menuitem"]')) {
      item.addEventListener('click', () => {
        chosen.push(item.textContent ?? '');
        layers.innerHTML = '';
        // X swaps the post for its feedback card inside the same cell.
        const cell = document.querySelector('[data-testid="cellInnerDiv"]')!;
        cell.innerHTML = '<div>Thanks. X will use this. <div role="button">Undo</div></div>';
      });
    }
    layers.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') layers.innerHTML = '';
    });
  });
}

beforeEach(() => {
  chosen = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  delete document.documentElement.dataset.aitfAuto;
});

it('opens the hidden post’s menu, chooses “Not interested”, and hands over the cell', async () => {
  mountTimeline(['Not interested in this post', 'Block @alice']);
  const article = document.querySelector<HTMLElement>('article')!;
  const before = vi.fn((node: HTMLElement) => {
    // The spot must still be in the page when it is claimed.
    expect(node.isConnected).toBe(true);
    expect(chosen).toEqual([]);
  });
  const after = vi.fn();
  const auto = new NotInterested({ before, after });
  auto.request(article, id);
  auto.request(article, id);
  await vi.advanceTimersByTimeAsync(100);
  expect(chosen).toEqual(['Not interested in this post']);
  expect(before).toHaveBeenCalledWith(article, id);
  expect(after).toHaveBeenCalledWith(id);
  await vi.advanceTimersByTimeAsync(5000);
  expect(chosen).toHaveLength(1);
  expect(before).toHaveBeenCalledTimes(1);
  expect(document.documentElement.dataset.aitfAuto).toBeUndefined();
});

it('closes an unrecognised menu and stops trying after repeated misses', async () => {
  mountTimeline(['Nicht interessiert', 'Block @alice']);
  const article = document.querySelector<HTMLElement>('article')!;
  const layers = document.getElementById('layers')!;
  let opened = 0;
  new MutationObserver(() => {
    if (layers.querySelector('[data-testid="Dropdown"]')) opened++;
  }).observe(layers, { childList: true });
  const auto = new NotInterested();
  for (let i = 0; i < 5; i++) {
    const next = `${id}${i}`;
    article.querySelector('a')!.setAttribute('href', `/alice/status/${next}`);
    layers.dataset.id = next;
    auto.request(article, next);
    await vi.advanceTimersByTimeAsync(4000);
  }
  expect(chosen).toEqual([]);
  expect(opened).toBe(3);
  expect(layers.innerHTML).toBe('');
});

it('leaves a post alone once it is no longer hidden', async () => {
  mountTimeline(['Not interested in this post']);
  const article = document.querySelector<HTMLElement>('article')!;
  const auto = new NotInterested();
  delete article.dataset.aitfHidden;
  auto.request(article, id);
  await vi.advanceTimersByTimeAsync(3000);
  expect(chosen).toEqual([]);
});

it('waits while the reader has a menu or dialog open anywhere', async () => {
  mountTimeline(['Not interested in this post']);
  const article = document.querySelector<HTMLElement>('article')!;
  const layers = document.getElementById('layers')!;
  layers.innerHTML = '<div role="dialog">Compose</div>';
  const auto = new NotInterested();
  auto.request(article, id);
  await vi.advanceTimersByTimeAsync(3000);
  expect(chosen).toEqual([]);
  layers.innerHTML = '';
  await vi.advanceTimersByTimeAsync(1000);
  expect(chosen).toEqual(['Not interested in this post']);
});
