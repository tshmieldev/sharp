// @vitest-environment jsdom
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { mountLock } from '../src/unfry/lock';
import { cards, describe as describeCard, UnfryYouTube } from '../src/youtube/unfry';

// jsdom has no pointer events, and Preact picks an event's name by asking the
// element whether it knows the handler; teach it the names browsers know.
for (const name of ['onpointerdown', 'onpointerup', 'onpointercancel', 'onlostpointercapture'])
  if (!(name in HTMLElement.prototype))
    Object.defineProperty(HTMLElement.prototype, name, { value: null, writable: true });

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function lock(onUnlock = vi.fn()) {
  const root = document.createElement('div');
  document.body.append(root);
  mountLock(root, {
    title: 'Alice',
    facts: ['88% likely fine', 'photo'],
    holdMs: 1000,
    onUnlock,
  });
  return { root, onUnlock, button: root.querySelector<HTMLElement>('.aitf-lock')! };
}

const pointer = (type: string, pointerId = 1) =>
  new (window.PointerEvent ?? MouseEvent)(type, { bubbles: true, button: 0, pointerId } as never);

function clock() {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  return {
    set(value: number) {
      now = value;
    },
    // Preact queues its effect flush on the same frame; run everything due.
    frame: () =>
      act(() => {
        for (const callback of frames.splice(0)) callback(now);
      }),
  };
}

it('opens after a held press, and not after a shorter one', () => {
  vi.useFakeTimers();
  const time = clock();
  const { button, onUnlock } = lock();
  expect(button.textContent).toContain('Alice');
  expect(button.textContent).toContain('88% likely fine');
  expect(button.textContent).toContain('Hold 1 s');

  // Let go early: nothing opens, and the hint says to keep holding.
  act(() => {
    button.dispatchEvent(pointer('pointerdown'));
  });
  time.set(600);
  time.frame();
  expect(button.hasAttribute('data-holding')).toBe(true);
  act(() => {
    button.dispatchEvent(pointer('pointerup'));
  });
  expect(onUnlock).not.toHaveBeenCalled();
  expect(button.textContent).toContain('Keep holding');
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(button.textContent).toContain('Hold 1 s');

  // Hold the full second.
  act(() => {
    button.dispatchEvent(pointer('pointerdown'));
  });
  time.set(1700);
  time.frame();
  expect(onUnlock).toHaveBeenCalledTimes(1);
});

it('a held Space or Enter opens it too, and a tap of the key does not', () => {
  const time = clock();
  const { button, onUnlock } = lock();
  const key = (type: string, repeat = false) =>
    new KeyboardEvent(type, { key: ' ', bubbles: true, cancelable: true, repeat });
  act(() => {
    button.dispatchEvent(key('keydown'));
  });
  act(() => {
    button.dispatchEvent(key('keydown', true));
  });
  time.set(300);
  time.frame();
  act(() => {
    button.dispatchEvent(key('keyup'));
  });
  expect(onUnlock).not.toHaveBeenCalled();
  act(() => {
    button.dispatchEvent(key('keydown'));
  });
  time.set(1400);
  time.frame();
  expect(onUnlock).toHaveBeenCalledTimes(1);
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

it('locks every video, blocks clicks on a locked one, and lets an opened one go', () => {
  const time = clock();
  document.body.innerHTML = `<ytd-rich-grid-renderer>${['a', 'b', 'c'].map((id) => video(id, `Video ${id}`)).join('')}</ytd-rich-grid-renderer>`;
  const unfry = new UnfryYouTube();
  act(() => unfry.start({ youtubeEnabled: true, unfryYoutube: true, unfryHoldMs: 1000 }));
  const items = [...document.querySelectorAll('ytd-rich-item-renderer')];
  expect(items.map((item) => item.hasAttribute('data-aitf-yt-locked'))).toEqual([true, true, true]);
  expect(items[0]!.querySelector('.aitf-yt-lock .aitf-lock-title')?.textContent).toBe('Video a');

  // A click on a locked card goes nowhere.
  const link = items[0]!.querySelector<HTMLAnchorElement>('#video-title')!;
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  act(() => {
    link.dispatchEvent(click);
  });
  expect(click.defaultPrevented).toBe(true);

  // Held: open, and it stays open on the next scan.
  const button = items[0]!.querySelector<HTMLElement>('.aitf-lock')!;
  act(() => {
    button.dispatchEvent(pointer('pointerdown'));
  });
  time.set(1200);
  time.frame();
  expect(items[0]!.hasAttribute('data-aitf-yt-locked')).toBe(false);
  expect(items[0]!.querySelector('.aitf-yt-lock')).toBeNull();
  act(() => unfry.scan());
  expect(items[0]!.hasAttribute('data-aitf-yt-locked')).toBe(false);
  expect(items[1]!.hasAttribute('data-aitf-yt-locked')).toBe(true);

  act(() => unfry.stop());
  expect(document.querySelector('[data-aitf-yt-locked], .aitf-yt-lock')).toBeNull();
});
