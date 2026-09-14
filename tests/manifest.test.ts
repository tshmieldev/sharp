import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
// @ts-expect-error -- a build script, deliberately outside the TypeScript project.
import { assetsOf, GECKO_ID, GECKO_MIN_VERSION, manifestFor } from '../scripts/manifest.mjs';
import { defaults, providerOrigins, siteOrigins } from '../src/common/settings';

const base = JSON.parse(await readFile('manifest.json', 'utf8'));

it('leaves Chrome the manifest in the repository, untouched', () => {
  expect(manifestFor(base, 'chrome')).toBe(base);
});

it('gives Firefox an event page, an add-on ID and a floor it can actually run', () => {
  const firefox = manifestFor(base, 'firefox');
  // A service worker key would make Firefox refuse the add-on outright.
  expect(firefox.background).toEqual({ scripts: ['background.js'], type: 'module' });
  expect('service_worker' in firefox.background).toBe(false);
  expect(firefox.browser_specific_settings.gecko).toEqual({
    id: GECKO_ID,
    strict_min_version: GECKO_MIN_VERSION,
    // AMO refuses a new add-on without this, and what it says has to match
    // privacy-policy.md: nothing to the developer, post content to the
    // provider the reader chose.
    data_collection_permissions: { required: ['websiteContent'] },
  });
  // 133 for storage.local.getBytesInUse, 140 for data_collection_permissions.
  expect(Number.parseFloat(GECKO_MIN_VERSION)).toBeGreaterThanOrEqual(140);
  expect(firefox.content_scripts).toEqual(base.content_scripts);
  expect(firefox.permissions).toEqual(base.permissions);
});

it('packages the same files whichever key names the background script', () => {
  const chrome = assetsOf(base);
  expect(assetsOf(manifestFor(base, 'firefox'))).toEqual(chrome);
  expect(chrome).toContain('background.js');
  expect(chrome).toContain('manifest.json');
  expect(chrome).toContain('wire.js');
  expect(chrome).toContain('content.css');
  expect(new Set(chrome).size).toBe(chrome.length);
});

it('asks for exactly the origins the manifest declares for the filtered sites', () => {
  for (const origin of siteOrigins) expect(base.host_permissions).toContain(origin);
});

it('derives a provider origin, and none from a URL that cannot be one', () => {
  expect(providerOrigins(defaults)).toEqual(['https://openrouter.ai/*']);
  expect(providerOrigins({ ...defaults, provider: 'anthropic' })).toEqual([
    'https://api.anthropic.com/*',
  ]);
  for (const origin of providerOrigins({ ...defaults, provider: 'openai' })) {
    expect(base.host_permissions).toContain(origin);
  }
  expect(providerOrigins({ provider: 'custom', customBaseUrl: 'https://example.com/v1' })).toEqual([
    'https://example.com/*',
  ]);
  expect(providerOrigins({ provider: 'custom', customBaseUrl: '' })).toEqual([]);
  expect(providerOrigins({ provider: 'custom', customBaseUrl: 'not a url' })).toEqual([]);
  // http is refused on save, so it must not be requested either.
  expect(providerOrigins({ provider: 'custom', customBaseUrl: 'http://example.com' })).toEqual([]);
});
