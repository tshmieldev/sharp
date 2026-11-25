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

// jsdom has no PointerEvent either: a mouse event that carries the pointer's id.
const pointer = (type: string, pointerId = 1) => {
  const event = new MouseEvent(type, { bubbles: true, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
};

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
  // The title is printed beside the thumbnail; the cover only names it aloud.
  const cover = items[0]!.querySelector('.aitf-yt-lock .aitf-lock')!;
  expect(cover.getAttribute('aria-label')).toContain('Video a');
  expect(cover.querySelector('.aitf-lock-title')).toBeNull();
  expect(cover.textContent).toContain('12:34');
  expect(cover.textContent).not.toContain('Some Channel');

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
  window.dispatchEvent(pointer('pointerup'));
  act(() => unfry.scan());
  expect(items[0]!.hasAttribute('data-aitf-yt-locked')).toBe(false);
  expect(items[1]!.hasAttribute('data-aitf-yt-locked')).toBe(true);

  act(() => unfry.stop());
  expect(document.querySelector('[data-aitf-yt-locked], .aitf-yt-lock')).toBeNull();
});

it('the release that opened a lock clicks nothing; the next click goes through', () => {
  vi.useFakeTimers();
  const time = clock();
  const { button, onUnlock } = lock();
  const behind = document.createElement('a');
  document.body.append(behind);
  const opened = vi.fn();
  behind.addEventListener('click', opened);

  act(() => {
    button.dispatchEvent(pointer('pointerdown'));
  });
  time.set(1100);
  time.frame();
  expect(onUnlock).toHaveBeenCalledTimes(1);

  // Still holding: a long press's menu is the lock's too.
  const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  behind.dispatchEvent(menu);
  expect(menu.defaultPrevented).toBe(true);

  behind.dispatchEvent(pointer('pointerup'));
  const release = new MouseEvent('click', { bubbles: true, cancelable: true });
  behind.dispatchEvent(release);
  expect(release.defaultPrevented).toBe(true);
  expect(opened).not.toHaveBeenCalled();

  vi.advanceTimersByTime(500);
  behind.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(opened).toHaveBeenCalledTimes(1);
});

it('a locked YouTube card plays no preview, on hover or in the feed', () => {
  document.body.innerHTML = `<ytd-rich-grid-renderer>${video('a', 'Video a')}</ytd-rich-grid-renderer>`;
  const card = document.querySelector('ytd-rich-item-renderer')!;
  const media = document.createElement('video');
  card.append(media);
  const thumb = card.querySelector('ytd-thumbnail')!;
  const hovered = vi.fn();
  thumb.addEventListener('mouseover', hovered);
  const pause = vi.spyOn(media, 'pause').mockImplementation(() => {});

  const unfry = new UnfryYouTube();
  act(() => unfry.start({ youtubeEnabled: true, unfryYoutube: true, unfryHoldMs: 1000 }));
  // Whatever was already playing stops as the card locks.
  expect(pause).toHaveBeenCalledTimes(1);
  thumb.querySelector('.aitf-lock')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  expect(hovered).not.toHaveBeenCalled();
  media.dispatchEvent(new Event('play'));
  expect(pause).toHaveBeenCalledTimes(2);

  act(() => unfry.stop());
  thumb.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  expect(hovered).toHaveBeenCalledTimes(1);
  media.dispatchEvent(new Event('play'));
  expect(pause).toHaveBeenCalledTimes(2);
});

it('locks a Short in a shelf as one card', () => {
  document.body.innerHTML = `<grid-shelf-view-model>
    <ytm-shorts-lockup-view-model-v2><ytm-shorts-lockup-view-model>
      <a href="/shorts/xyz"><yt-thumbnail-view-model><img></yt-thumbnail-view-model></a>
      <h3>A short</h3>
    </ytm-shorts-lockup-view-model></ytm-shorts-lockup-view-model-v2>
  </grid-shelf-view-model>`;
  expect(cards().map((card) => [card.element.tagName.toLowerCase(), card.key])).toEqual([
    ['ytm-shorts-lockup-view-model-v2', '/shorts/xyz'],
  ]);
});

it('only the finger that opened the lock ends its release', () => {
  vi.useFakeTimers();
  const time = clock();
  const { button } = lock();
  const behind = document.createElement('a');
  document.body.append(behind);
  act(() => {
    button.dispatchEvent(pointer('pointerdown', 1));
  });
  time.set(1100);
  time.frame();
  // A second finger lifts, and time passes: the first is still down.
  behind.dispatchEvent(pointer('pointerup', 2));
  vi.advanceTimersByTime(500);
  behind.dispatchEvent(pointer('pointerup', 1));
  const release = new MouseEvent('click', { bubbles: true, cancelable: true });
  behind.dispatchEvent(release);
  expect(release.defaultPrevented).toBe(true);
  vi.advanceTimersByTime(500);
});

it('a key hold stops when focus moves away', () => {
  const time = clock();
  const { button, onUnlock } = lock();
  act(() => {
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );
  });
  time.set(300);
  time.frame();
  act(() => {
    button.dispatchEvent(new FocusEvent('blur'));
  });
  time.set(1500);
  time.frame();
  expect(onUnlock).not.toHaveBeenCalled();
});
