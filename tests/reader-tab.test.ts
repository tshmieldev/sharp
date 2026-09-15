// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readerTab } from '../src/popup/App';

const POPUP = 'chrome-extension://extension-id/popup.html';

/** `tabs.query` filtered the way Chrome filters it: `active`/`currentWindow`
 *  narrow the set, and an empty query matches every tab. */
function mockTabs(tabs: { url?: string; active?: boolean; lastAccessed?: number }[]) {
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://extension-id/${path}` },
    tabs: {
      query: vi.fn(async (q: { active?: boolean }) =>
        q.active ? tabs.filter((tab) => tab.active) : tabs,
      ),
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

it('reads the active tab, which is the page a floating popup sits over', async () => {
  mockTabs([{ url: 'https://x.com/home', active: true }]);
  await expect(readerTab()).resolves.toBe('https://x.com/home');
});

it('reports an unrelated active tab rather than reaching for a background one', async () => {
  // The reader is looking at Hacker News. Answering "x.com" because a tab is
  // open there would show the X panel, and its thread toggle, over a thread
  // they cannot see. Not selecting a site is the correct outcome here.
  mockTabs([
    { url: 'https://news.ycombinator.com/', active: true },
    { url: 'https://x.com/home', lastAccessed: 10 },
  ]);
  await expect(readerTab()).resolves.toBe('https://news.ycombinator.com/');
});

it('looks past the popup when the popup is itself the active tab', async () => {
  // Kiwi on Android: nowhere to float a panel, so popup.html occupies a tab.
  mockTabs([
    { url: POPUP, active: true },
    { url: 'https://x.com/home', lastAccessed: 10 },
  ]);
  await expect(readerTab()).resolves.toBe('https://x.com/home');
});

it('prefers the most recently touched supported tab, and ignores the rest', async () => {
  mockTabs([
    { url: POPUP, active: true },
    { url: 'https://x.com/home', lastAccessed: 10 },
    { url: 'https://news.ycombinator.com/', lastAccessed: 99 },
    { url: 'https://www.youtube.com/watch?v=1', lastAccessed: 42 },
  ]);
  await expect(readerTab()).resolves.toBe('https://www.youtube.com/watch?v=1');
});

it('answers with nothing when the popup is alone and no supported tab is open', async () => {
  mockTabs([
    { url: POPUP, active: true },
    { url: 'https://news.ycombinator.com/', lastAccessed: 99 },
  ]);
  await expect(readerTab()).resolves.toBeUndefined();
});

it('is not fooled by an extension ID that ours is a prefix of', async () => {
  mockTabs([
    { url: 'chrome-extension://extension-id-other/popup.html', active: true },
    { url: 'https://x.com/home', lastAccessed: 10 },
  ]);
  await expect(readerTab()).resolves.toBe('chrome-extension://extension-id-other/popup.html');
});
