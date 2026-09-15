// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { apply, startYouTube } from '../src/youtube';
import { startSite } from '../src/index';
import { defaults, publicSettings } from '../src/common/settings';
import { mockChrome } from './chrome';

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(document.documentElement.dataset)) {
    delete document.documentElement.dataset[key];
  }
});

const settings = (patch: Partial<typeof defaults>) => publicSettings({ ...defaults, ...patch });

it('maps each toggle to one attribute on <html> and clears it again', () => {
  apply(settings({ hideShorts: true, hideComments: true }));
  expect(document.documentElement.dataset).toMatchObject({ aitfYtShorts: '', aitfYtComments: '' });
  expect('aitfYtThumbs' in document.documentElement.dataset).toBe(false);
  apply(settings({ thumbnails: 'blurred' }));
  expect(document.documentElement.dataset.aitfYtThumbs).toBe('blurred');
  apply(settings({ thumbnails: 'hidden' }));
  expect(document.documentElement.dataset.aitfYtThumbs).toBe('hidden');
  apply(settings({ youtubeGreyscaleUi: true, youtubeGreyscaleContent: true }));
  expect(document.documentElement.dataset).toMatchObject({
    aitfYtGreyUi: '',
    aitfYtGreyContent: '',
  });
  apply(settings({}));
  expect('aitfYtShorts' in document.documentElement.dataset).toBe(false);
  expect('aitfYtComments' in document.documentElement.dataset).toBe(false);
});

it('sets nothing while Sharp is off for YouTube', () => {
  apply(
    settings({ youtubeEnabled: false, hideShorts: true, thumbnails: 'hidden', hideComments: true }),
  );
  expect(Object.keys(document.documentElement.dataset)).toEqual([]);
});

it('reads settings on start, follows storage changes and cleans up on dispose', async () => {
  const { chrome } = mockChrome();
  let current = settings({ thumbnails: 'hidden' });
  const send = vi.fn(async () => current);
  const dispose = startYouTube(send as never);
  await Promise.resolve();
  await Promise.resolve();
  expect(document.documentElement.dataset.aitfYtThumbs).toBe('hidden');

  const listener = chrome.storage.onChanged.addListener.mock.calls[0]?.[0] as (
    changes: Record<string, unknown>,
    area: string,
  ) => void;
  current = settings({ hideShorts: true });
  listener({ settings: {} }, 'local');
  await Promise.resolve();
  await Promise.resolve();
  expect(document.documentElement.dataset.aitfYtShorts).toBe('');
  expect('aitfYtThumbs' in document.documentElement.dataset).toBe(false);

  dispose();
  expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(listener);
  expect('aitfYtShorts' in document.documentElement.dataset).toBe(false);
});

it('starts the YouTube adapter for both YouTube hostnames, over HTTPS only', () => {
  mockChrome();
  for (const hostname of ['www.youtube.com', 'm.youtube.com']) {
    const dispose = startSite({ protocol: 'https:', hostname });
    expect(typeof dispose).toBe('function');
    dispose?.();
  }
  expect(startSite({ protocol: 'http:', hostname: 'www.youtube.com' })).toBeUndefined();
  expect(startSite({ protocol: 'http:', hostname: 'm.youtube.com' })).toBeUndefined();
});

it('matches YouTube hostnames exactly, so a lookalike starts nothing', () => {
  mockChrome();
  for (const hostname of [
    'youtube.com',
    'music.youtube.com',
    'studio.youtube.com',
    'm.youtube.com.evil.test',
    'notm.youtube.com',
  ]) {
    expect(startSite({ protocol: 'https:', hostname })).toBeUndefined();
  }
});
