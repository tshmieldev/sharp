import { Effect } from 'effect';
import { afterEach, expect, it, vi } from 'vitest';
import { defaults } from '../src/common/settings';
import { mockChrome } from './chrome';

afterEach(() => vi.unstubAllGlobals());

it('migrates legacy settings locally before removing synced credentials', async () => {
  vi.resetModules();
  const { chrome, local, sync } = mockChrome({}, { ...defaults, apiKeys: { openai: 'test-key' } });
  const { getSettings } = await import('../src/background/storage');
  await Promise.all([Effect.runPromise(getSettings), Effect.runPromise(getSettings)]);
  expect(local.settings).toMatchObject({ apiKeys: { openai: 'test-key' } });
  expect(sync).not.toHaveProperty('apiKeys');
  expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  expect(chrome.storage.sync.remove).toHaveBeenCalledTimes(1);
});

it('does not delete synced credentials if migration cannot persist them', async () => {
  vi.resetModules();
  const { chrome, sync } = mockChrome({}, { ...defaults, apiKeys: { openai: 'test-key' } });
  chrome.storage.local.set.mockRejectedValueOnce(new Error('disk full'));
  const { getSettings } = await import('../src/background/storage');
  await expect(Effect.runPromise(getSettings)).rejects.toThrow('disk full');
  expect(sync).toHaveProperty('apiKeys');
});

it('serializes concurrent list edits and counter increments', async () => {
  vi.resetModules();
  mockChrome({ settings: defaults });
  const { toggleList, getSettings, bumpStats, getStats } =
    await import('../src/background/storage');
  await Promise.all([
    Effect.runPromise(toggleList('allowedAuthors', 'alice')),
    Effect.runPromise(toggleList('allowedAuthors', 'bob')),
    Effect.runPromise(bumpStats({ tokens: 3 })),
    Effect.runPromise(bumpStats({ tokens: 5 })),
  ]);
  expect((await Effect.runPromise(getSettings)).allowedAuthors).toEqual(['alice', 'bob']);
  expect((await Effect.runPromise(getStats)).tokens).toBe(8);
});

it('sets mutually exclusive author rules atomically and idempotently', async () => {
  vi.resetModules();
  const { chrome } = mockChrome({ settings: { ...defaults, allowedAuthors: ['ALICE', 'bob'] } });
  const { setAuthorRule, getSettings } = await import('../src/background/storage');
  await Effect.runPromise(setAuthorRule('alice', 'block'));
  expect((await Effect.runPromise(getSettings)).allowedAuthors).toEqual(['bob']);
  expect((await Effect.runPromise(getSettings)).blockedAuthors).toEqual(['alice']);
  expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  await Effect.runPromise(setAuthorRule('alice', 'block'));
  expect((await Effect.runPromise(getSettings)).blockedAuthors).toEqual(['alice']);
  await Effect.runPromise(setAuthorRule('Alice', 'allow'));
  expect((await Effect.runPromise(getSettings)).blockedAuthors).toEqual([]);
  await Effect.runPromise(setAuthorRule('ALICE', 'default'));
  expect((await Effect.runPromise(getSettings)).allowedAuthors).toEqual(['bob']);
});

it('serializes concurrent opposite author-rule changes without leaving a conflict', async () => {
  vi.resetModules();
  mockChrome({ settings: defaults });
  const { setAuthorRule, getSettings } = await import('../src/background/storage');
  await Promise.all([
    Effect.runPromise(setAuthorRule('alice', 'allow')),
    Effect.runPromise(setAuthorRule('alice', 'block')),
  ]);
  const settings = await Effect.runPromise(getSettings);
  expect(settings.allowedAuthors).toEqual([]);
  expect(settings.blockedAuthors).toEqual(['alice']);
});

it('enforces the same author-rule exclusivity in list toggles and popup patches', async () => {
  vi.resetModules();
  mockChrome({ settings: { ...defaults, allowedAuthors: ['alice'] } });
  const { toggleList, patchSettings, getSettings } = await import('../src/background/storage');
  await Effect.runPromise(toggleList('blockedAuthors', 'Alice'));
  expect((await Effect.runPromise(getSettings)).allowedAuthors).toEqual([]);
  await Effect.runPromise(patchSettings({ allowedAuthors: ['ALICE'] }));
  expect((await Effect.runPromise(getSettings)).blockedAuthors).toEqual([]);
  await expect(
    Effect.runPromise(
      patchSettings({
        allowedAuthors: ['alice'],
        blockedAuthors: ['ALICE'],
      }),
    ),
  ).rejects.toThrow('cannot be both');
  expect((await Effect.runPromise(getSettings)).allowedAuthors).toEqual(['ALICE']);
});

it('sets thread bypass idempotently without losing concurrent settings edits', async () => {
  vi.resetModules();
  mockChrome({ settings: { ...defaults, bypassedThreads: ['1'] } });
  const { setThreadBypass, setAuthorRule, getSettings, toggleList } =
    await import('../src/background/storage');
  await Promise.all([
    Effect.runPromise(setThreadBypass('2', true)),
    Effect.runPromise(setThreadBypass('2', true)),
    Effect.runPromise(setThreadBypass('3', true)),
    Effect.runPromise(setAuthorRule('alice', 'block')),
  ]);
  expect(await Effect.runPromise(getSettings)).toMatchObject({
    bypassedThreads: ['1', '2', '3'],
    blockedAuthors: ['alice'],
  });
  await Effect.runPromise(setThreadBypass('2', false));
  await Effect.runPromise(setThreadBypass('2', false));
  expect((await Effect.runPromise(getSettings)).bypassedThreads).toEqual(['1', '3']);
  // Popup and keyboard toggles operate on the same saved state.
  await Effect.runPromise(toggleList('bypassedThreads', '3'));
  expect((await Effect.runPromise(getSettings)).bypassedThreads).toEqual(['1']);
});

it('bounds thread bypasses and preserves saved settings on write failure', async () => {
  vi.resetModules();
  const threads = Array.from({ length: 200 }, (_, i) => String(i + 1));
  const { chrome } = mockChrome({ settings: { ...defaults, bypassedThreads: threads } });
  const { setThreadBypass, getSettings } = await import('../src/background/storage');
  chrome.storage.local.set.mockRejectedValueOnce(new Error('disk full'));
  await expect(Effect.runPromise(setThreadBypass('201', true))).rejects.toThrow('disk full');
  expect((await Effect.runPromise(getSettings)).bypassedThreads).toEqual(threads);
  await Effect.runPromise(setThreadBypass('201', true));
  expect((await Effect.runPromise(getSettings)).bypassedThreads).toEqual([
    ...threads.slice(1),
    '201',
  ]);
});
