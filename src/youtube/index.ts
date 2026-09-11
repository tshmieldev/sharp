import './style.css';
import { request } from '../common/messages';
import type { PublicSettings } from '../common/settings';

/** Each switch is one attribute on <html>; the stylesheet does the hiding. */
export const flags = {
  hideShorts: 'aitfYtShorts',
  hideComments: 'aitfYtComments',
  youtubeGreyscaleUi: 'aitfYtGreyUi',
  youtubeGreyscaleContent: 'aitfYtGreyContent',
} as const;
/** Thumbnails have three states; the attribute carries the chosen one. */
const THUMBNAILS = 'aitfYtThumbs';
export type YouTubeSettings = Pick<
  PublicSettings,
  keyof typeof flags | 'youtubeEnabled' | 'thumbnails'
>;

export function apply(settings: YouTubeSettings, root: HTMLElement = document.documentElement) {
  const on = settings.youtubeEnabled;
  for (const [key, attribute] of Object.entries(flags) as [keyof typeof flags, string][]) {
    if (on && settings[key]) root.dataset[attribute] = '';
    else delete root.dataset[attribute];
  }
  if (on && settings.thumbnails !== 'shown') root.dataset[THUMBNAILS] = settings.thumbnails;
  else delete root.dataset[THUMBNAILS];
}

const off: YouTubeSettings = {
  youtubeEnabled: false,
  hideShorts: false,
  thumbnails: 'shown',
  hideComments: false,
  youtubeGreyscaleUi: false,
  youtubeGreyscaleContent: false,
};

/** Importing a site entry must not install listeners or touch the page. */
export function startYouTube(send: typeof request = request) {
  let disposed = false;
  let revision = 0;
  const refresh = async () => {
    const current = ++revision;
    try {
      const settings = await send({ type: 'GET_PUBLIC_SETTINGS' });
      if (!disposed && current === revision) apply(settings);
    } catch {
      // An invalidated extension context cannot recover without reloading the tab.
      dispose();
    }
  };
  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes.settings) void refresh();
  };
  const onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) dispose();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    chrome.storage?.onChanged?.removeListener(onStorage);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    apply(off);
  };
  const onPageShow = () => void refresh();
  chrome.storage?.onChanged?.addListener(onStorage);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  void refresh();
  return dispose;
}
