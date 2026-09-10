import { afterEach, expect, it, vi } from 'vitest';
import { request, Request } from '../src/common/messages';
import { Schema } from 'effect';
import { defaults } from '../src/common/settings';
import { mockChrome } from './chrome';

afterEach(() => vi.unstubAllGlobals());

it('rejects malformed payloads before they reach a handler', () => {
  expect(() =>
    Schema.decodeUnknownSync(Request)({
      type: 'PATCH_SETTINGS',
      patch: { batchSize: -5 },
    }),
  ).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(Request)({
      type: 'EVALUATE',
      scope: '',
      items: [{ key: '1', text: 'missing fields' }],
    }),
  ).toThrow();
  expect(() => Schema.decodeUnknownSync(Request)({ type: 'ARBITRARY_COMMAND' })).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(Request)({
      type: 'SET_AUTHOR_RULE',
      handle: 'not a handle',
      rule: 'allow',
    }),
  ).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(Request)({
      type: 'SET_AUTHOR_RULE',
      handle: 'alice',
      rule: 'invalid',
    }),
  ).toThrow();
});

it('validates replies instead of trusting the runtime transport', async () => {
  const { chrome } = mockChrome();
  chrome.runtime.sendMessage.mockResolvedValue({ ok: true, result: { enabled: true } });
  await expect(request({ type: 'GET_PUBLIC_SETTINGS' })).rejects.toThrow();
  chrome.runtime.sendMessage.mockResolvedValue({ ok: false, error: 'Storage unavailable' });
  await expect(request({ type: 'GET_SETTINGS' })).rejects.toThrow('Storage unavailable');
});

it.each([
  { threadId: '', bypassed: true },
  { threadId: '/alice/status/1', bypassed: true },
  { threadId: '1'.repeat(201), bypassed: true },
  { threadId: '1', bypassed: 'true' },
])('rejects invalid thread bypass payloads: %j', (payload) => {
  expect(() =>
    Schema.decodeUnknownSync(Request)({ type: 'SET_THREAD_BYPASS', ...payload }),
  ).toThrow();
});

it('denies privileged content-script requests but allows the popup', async () => {
  vi.resetModules();
  const { chrome } = mockChrome({ settings: defaults });
  let listener!: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    respond: (response: unknown) => void,
  ) => boolean;
  vi.stubGlobal('chrome', {
    ...chrome,
    runtime: {
      ...chrome.runtime,
      getURL: (path: string) => `chrome-extension://extension-id/${path}`,
      onMessage: {
        addListener: (handler: typeof listener) => {
          listener = handler;
        },
      },
    },
    commands: { onCommand: { addListener: vi.fn() } },
  });
  await import('../src/background/index');
  const send = (type: string, sender: chrome.runtime.MessageSender, payload = {}) =>
    new Promise((resolve) => listener({ type, ...payload }, sender, resolve));
  const content = {
    id: 'extension-id',
    url: 'https://x.com/home',
    tab: {
      id: 1,
      index: 0,
      pinned: false,
      highlighted: false,
      windowId: 1,
      active: true,
      incognito: false,
      selected: true,
      discarded: false,
      autoDiscardable: true,
      groupId: -1,
      frozen: false,
    },
  };
  expect(await send('GET_SETTINGS', content)).toMatchObject({ ok: false });
  const publicReply = await send('GET_PUBLIC_SETTINGS', content);
  expect(publicReply).toMatchObject({ ok: true, result: { configured: false } });
  expect(publicReply).not.toHaveProperty('result.apiKeys');
  expect(await send('SET_AUTHOR_RULE', content, { handle: 'alice', rule: 'allow' })).toMatchObject({
    ok: true,
  });
  expect(await send('GET_PUBLIC_SETTINGS', content)).toMatchObject({
    ok: true,
    result: { allowedAuthors: ['alice'], blockedAuthors: [] },
  });
  expect(
    await send('SET_THREAD_BYPASS', content, { threadId: '100', bypassed: true }),
  ).toMatchObject({
    ok: true,
  });
  expect(await send('GET_PUBLIC_SETTINGS', content)).toMatchObject({
    ok: true,
    result: { bypassedThreads: ['100'] },
  });
  expect(
    await send('GET_SETTINGS', {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/popup.html',
    }),
  ).toMatchObject({ ok: true, result: { apiKeys: {} } });
});

it('fills settings from an older worker with defaults instead of failing', async () => {
  const { chrome } = mockChrome();
  const { concurrency: _dropped, ...stale } = defaults;
  chrome.runtime.sendMessage.mockResolvedValue({ ok: true, result: stale });
  await expect(request({ type: 'GET_SETTINGS' })).resolves.toMatchObject({
    concurrency: defaults.concurrency,
  });
  chrome.runtime.sendMessage.mockResolvedValue({ ok: true, result: { ...stale, enabled: 'yes' } });
  await expect(request({ type: 'GET_SETTINGS' })).rejects.toThrow();
});
