// @vitest-environment jsdom
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { newPuzzle, solves } from '../src/unfry/puzzle';
import { mountLock } from '../src/unfry/lock';
import { createPager } from '../src/unfry/pager';
import { cards, describe as describeCard, UnfryYouTube } from '../src/youtube/unfry';

// jsdom has no pointer events, and Preact picks an event's name by asking the
// element whether it knows the handler; teach it the names browsers know.
for (const name of ['onpointerdown', 'onpointerup', 'onpointercancel', 'onlostpointercapture'])
  if (!(name in HTMLElement.prototype))
    Object.defineProperty(HTMLElement.prototype, name, { value: null, writable: true });
window.scrollTo = vi.fn();

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

it('deals sums a tired reader can still do, and checks only the number', () => {
  const fixed = (value: number) => () => value;
  expect(newPuzzle('easy', fixed(0))).toEqual({ question: '2 + 2', answer: 4 });
  expect(newPuzzle('easy', fixed(0.999))).toEqual({ question: '9 + 9', answer: 18 });
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    for (let round = 0; round < 200; round++) {
      const puzzle = newPuzzle(difficulty);
      expect(Number.isInteger(puzzle.answer)).toBe(true);
      expect(puzzle.answer).toBeGreaterThan(0);
      expect(puzzle.question).toMatch(/^\d+ [+−×] \d+( − \d+)?$/);
    }
  }
  const puzzle = { question: '7 + 5', answer: 12 };
  expect(solves(puzzle, ' 12 ')).toBe(true);
  expect(solves(puzzle, '+12')).toBe(true);
  expect(solves(puzzle, '')).toBe(false);
  expect(solves(puzzle, '12a')).toBe(false);
  expect(solves(puzzle, '13')).toBe(false);
});

function lock(onUnlock = vi.fn()) {
  const root = document.createElement('div');
  document.body.append(root);
  mountLock(root, {
    title: 'Alice',
    facts: ['88% likely fine', 'photo'],
    holdMs: 1000,
    difficulty: 'easy',
    onUnlock,
  });
  return { root, onUnlock, button: root.querySelector<HTMLElement>('.aitf-lock')! };
}

const pointer = (type: string, pointerId = 1) =>
  new (window.PointerEvent ?? MouseEvent)(type, { bubbles: true, button: 0, pointerId } as never);

it('opens after a held press, and not after a shorter one', () => {
  vi.useFakeTimers();
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const { button, onUnlock } = lock();
  expect(button.textContent).toContain('Alice');
  expect(button.textContent).toContain('88% likely fine');
  expect(button.textContent).toContain('Hold 1 s');

  // Let go early: nothing opens, and since it was longer than a tap, no sum.
  act(() => {
    button.dispatchEvent(pointer('pointerdown'));
  });
  now = 600;
  act(() => frames.shift()!(now));
  act(() => {
    button.dispatchEvent(pointer('pointerup'));
  });
  expect(onUnlock).not.toHaveBeenCalled();
  expect(document.querySelector('.aitf-lock-puzzle')).toBeNull();

  // Hold the full second.
  act(() => {
    button.dispatchEvent(pointer('pointerdown'));
  });
  now = 1700;
  act(() => frames.shift()!(now));
  expect(onUnlock).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});

it('a tap asks for a sum; a wrong answer deals another, the right one opens', () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const { root, button, onUnlock } = lock();
  act(() => {
    button.dispatchEvent(pointer('pointerdown'));
  });
  now = 80;
  act(() => {
    button.dispatchEvent(pointer('pointerup'));
  });
  const form = root.querySelector<HTMLFormElement>('.aitf-lock-puzzle')!;
  expect(form).not.toBeNull();
  const question = root.querySelector('.aitf-lock-sum')!.textContent!;
  const [a, b] = question.match(/\d+/g)!.map(Number);
  const input = root.querySelector<HTMLInputElement>('.aitf-lock-answer')!;
  input.value = String(a! + b! + 1);
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(onUnlock).not.toHaveBeenCalled();
  expect(root.querySelector('.aitf-lock-puzzle')?.getAttribute('data-wrong')).toBe('1');
  const again = root.querySelector('.aitf-lock-sum')!.textContent!;
  const [c, d] = again.match(/\d+/g)!.map(Number);
  const second = root.querySelector<HTMLInputElement>('.aitf-lock-answer')!;
  second.value = String(c! + d!);
  act(() => {
    second.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(onUnlock).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});

it('draws the pager once and takes it down', () => {
  const pager = createPager();
  const onNext = vi.fn();
  act(() =>
    pager.update({
      page: 2,
      hasPrev: true,
      hasNext: false,
      shown: 1,
      size: 3,
      onPrev: vi.fn(),
      onNext,
    }),
  );
  const nav = document.querySelector('.aitf-pager')!;
  expect(nav.textContent).toContain('Page 2');
  expect(nav.textContent).toContain('1/3');
  act(() => nav.querySelectorAll<HTMLButtonElement>('button')[1]!.click());
  expect(onNext).toHaveBeenCalled();
  act(() =>
    pager.update({
      page: 3,
      hasPrev: true,
      hasNext: true,
      shown: 3,
      size: 3,
      onPrev: vi.fn(),
      onNext,
    }),
  );
  expect(document.querySelectorAll('.aitf-pager')).toHaveLength(1);
  expect(document.querySelector('.aitf-pager')!.textContent).not.toContain('/3');
  act(() => pager.destroy());
  expect(document.querySelector('.aitf-pager')).toBeNull();
});

const video = (id: string, title: string) =>
  `<ytd-rich-item-renderer><div id="content"><ytd-rich-grid-media>
    <ytd-thumbnail><a href="/watch?v=${id}"><yt-image><img src="https://i.ytimg.com/vi/${id}/hq.jpg"></yt-image></a>
      <ytd-thumbnail-overlay-time-status-renderer><span id="text">12:34</span></ytd-thumbnail-overlay-time-status-renderer></ytd-thumbnail>
    <div id="details"><a id="video-title" href="/watch?v=${id}">${title}</a>
      <ytd-channel-name><div id="text">Some Channel</div></ytd-channel-name></div>
  </ytd-rich-grid-media></div></ytd-rich-item-renderer>`;

it('finds YouTube cards once each and reads their title, channel and length', () => {
  document.body.innerHTML = `<ytd-rich-grid-renderer>${video('a1', 'First')}${video('b2', 'Second')}</ytd-rich-grid-renderer>`;
  const found = cards();
  expect(found.map((card) => card.key)).toEqual(['/watch?v=a1', '/watch?v=b2']);
  expect(describeCard(found[0]!.element)).toEqual({
    title: 'First',
    channel: 'Some Channel',
    duration: '12:34',
  });
});

it('locks every video on the page, blanks the rest, and turns pages', () => {
  document.body.innerHTML = `<ytd-rich-grid-renderer>${['a', 'b', 'c', 'd', 'e'].map((id) => video(id, `Video ${id}`)).join('')}</ytd-rich-grid-renderer>`;
  const unfry = new UnfryYouTube();
  const settings = {
    youtubeEnabled: true,
    unfryYoutube: true,
    unfryHoldMs: 1000,
    unfryPuzzle: 'easy' as const,
    unfryPageSize: 2,
  };
  act(() => unfry.start(settings));
  const items = [...document.querySelectorAll('ytd-rich-item-renderer')];
  expect(items.map((item) => item.hasAttribute('data-aitf-yt-locked'))).toEqual([
    true,
    true,
    false,
    false,
    false,
  ]);
  expect(items.map((item) => item.hasAttribute('data-aitf-yt-blank'))).toEqual([
    false,
    false,
    true,
    true,
    true,
  ]);
  expect(items[0]!.querySelector('.aitf-yt-lock .aitf-lock-title')?.textContent).toBe('Video a');
  expect(document.querySelector('.aitf-pager')!.textContent).toContain('Page 1');

  // A click on a locked card goes nowhere and asks for the sum instead.
  const link = items[0]!.querySelector<HTMLAnchorElement>('#video-title')!;
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  act(() => {
    link.dispatchEvent(click);
  });
  expect(click.defaultPrevented).toBe(true);
  expect(items[0]!.querySelector('.aitf-lock-puzzle')).not.toBeNull();

  // Next page: the third and fourth, the first two blank.
  act(() => document.querySelectorAll<HTMLButtonElement>('.aitf-pager button')[1]!.click());
  expect(items.map((item) => item.hasAttribute('data-aitf-yt-blank'))).toEqual([
    true,
    true,
    false,
    false,
    true,
  ]);
  expect(items.map((item) => item.hasAttribute('data-aitf-yt-locked'))).toEqual([
    false,
    false,
    true,
    true,
    false,
  ]);
  expect(document.querySelector('.aitf-pager')!.textContent).toContain('Page 2');
  act(() => document.querySelectorAll<HTMLButtonElement>('.aitf-pager button')[0]!.click());
  expect(items.map((item) => item.hasAttribute('data-aitf-yt-blank'))).toEqual([
    false,
    false,
    true,
    true,
    true,
  ]);

  act(() => unfry.stop());
  expect(
    document.querySelector('[data-aitf-yt-locked], [data-aitf-yt-blank], .aitf-pager'),
  ).toBeNull();
});
