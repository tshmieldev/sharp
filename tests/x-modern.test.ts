// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, expect, it } from 'vitest';
import * as extract from '../src/x/extract';

// Two rows captured from x.com/home on the rebuilt client: one photo post, one
// promoted video post with text. No data-testid anywhere.
const home = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'x-modern-home.html'),
  'utf8',
);

const legacy = `<div data-testid="cellInnerDiv"><article data-testid="tweet">
  <div data-testid="User-Name"><a href="/alice"><span>Alice</span></a><a href="/alice"><span>@alice</span></a>
    <a href="/alice/status/42"><time datetime="2026-01-01T00:00:00Z">1h</time></a></div>
  <div data-testid="tweetText">old client text</div>
</article></div>`;

beforeEach(() => {
  document.body.innerHTML = home;
});

it('finds the rebuilt client and its posts', () => {
  expect(extract.modernClient()).toBe(true);
  const articles = document.querySelectorAll(extract.articleSelector);
  expect(articles).toHaveLength(2);
  expect(extract.cellOf(articles[0]!)?.getAttribute('data-index')).toBe('0');
});

it('reads the author, id, text and media of a rebuilt post', () => {
  const [photo, video] = [...document.querySelectorAll<HTMLElement>(extract.articleSelector)];
  expect(extract.author(photo!)).toEqual({
    handle: 'burny_tech',
    name: 'Burny - Effective Curiosity',
  });
  expect(extract.postId(photo!)).toBe('2120255702132551840');
  expect(extract.text(photo!)).toBe('');
  expect(extract.images(photo!, 4)).toEqual([
    'https://pbs.twimg.com/media/HWypUhaWEAAVJwh?format=webp&name=small',
  ]);
  expect(extract.reposter(photo!)).toBe('');

  expect(extract.describe(video!, 4, null)).toEqual({
    key: '2117950049422660012',
    handle: 'CabelaSchmitt',
    text: 'Fun Lively Rock Christmas Song',
    images: [
      'https://pbs.twimg.com/amplify_video_thumb/2117949018722693120/img/SILJkI2JXDhFGqxh.jpg',
    ],
    context: '',
  });
});

it('orders rows by their index, not by where X happened to put the nodes', () => {
  const [first, second] = [...document.querySelectorAll<HTMLElement>(extract.articleSelector)];
  // X recycles nodes: move the first row after the second in the document.
  second!.closest('li')!.after(first!.closest('li')!);
  expect(extract.isThreadContext(first!, second!)).toBe(true);
  expect(extract.isThreadContext(second!, first!)).toBe(false);
});

it('treats a quoted post as part of the post around it', () => {
  const [photo] = [...document.querySelectorAll<HTMLElement>(extract.articleSelector)];
  const body = photo!.querySelector('.flex.min-w-0.flex-1')!;
  body.insertAdjacentHTML(
    'beforeend',
    `<div data-slot="embedded-tweet-frame"><div role="link" data-href="/bob/status/7"><article class="flex flex-col">
      <div data-post-avatar="true"><a href="/bob"></a></div>
      <div class="x-middot-group"><a href="/bob"><div>Bob</div></a><a href="/bob/status/7">2h</a></div>
      <div dir="auto" class="whitespace-pre-wrap">quoted words</div>
    </article></div></div>`,
  );
  expect(document.querySelectorAll(extract.articleSelector)).toHaveLength(2);
  expect(extract.postId(photo!)).toBe('2120255702132551840');
  expect(extract.author(photo!).handle).toBe('burny_tech');
  expect(extract.text(photo!)).toBe('quoted words');
});

it('still reads the old client', () => {
  document.body.innerHTML = legacy;
  expect(extract.modernClient()).toBe(true);
  const article = document.querySelector<HTMLElement>(extract.articleSelector)!;
  expect(extract.describe(article, 0, null)).toEqual({
    key: '42',
    handle: 'alice',
    text: 'old client text',
    images: [],
    context: '',
  });
  expect(extract.cellOf(article)?.getAttribute('data-testid')).toBe('cellInnerDiv');
});
