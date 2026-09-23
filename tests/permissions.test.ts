// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { ensureOrigins } from '../src/popup/App';

function mockRequest(request?: () => Promise<boolean>) {
  const requested: string[][] = [];
  vi.stubGlobal('chrome', {
    permissions: {
      request: vi.fn(({ origins }: { origins: string[] }) => {
        requested.push(origins);
        return request ? request() : Promise.resolve(true);
      }),
    },
  });
  return requested;
}
afterEach(() => vi.unstubAllGlobals());

it('never shows a prompt for origins the browser already allows', async () => {
  // Kiwi opens the popup as a tab with no window to draw a prompt in, so a
  // request for OpenRouter, granted at install, would fail and block the save.
  const requested = mockRequest();
  await expect(
    ensureOrigins(['https://openrouter.ai/*'], ['https://x.com/*', 'https://openrouter.ai/*']),
  ).resolves.toBeUndefined();
  expect(requested).toEqual([]);
  // A grant that covers every site covers this one too.
  await ensureOrigins(['https://api.typesafe.ai/*'], ['https://*/*']);
  expect(requested).toEqual([]);
});

it('asks only for what is missing, synchronously, while the gesture is still live', async () => {
  // Firefox refuses a prompt after any await in the handler, so the request
  // must already be in flight before ensureOrigins yields.
  const requested = mockRequest();
  const pending = ensureOrigins(
    ['https://openrouter.ai/*', 'https://ai-gateway.vercel.sh/*'],
    ['https://openrouter.ai/*'],
  );
  expect(requested).toEqual([['https://ai-gateway.vercel.sh/*']]);
  await pending;
});

it('fails the save when the prompt is refused, and explains one that cannot be shown', async () => {
  mockRequest(async () => false);
  await expect(ensureOrigins(['https://api.typesafe.ai/*'], [])).rejects.toThrow('not granted');

  mockRequest(async () => {
    throw new Error('No active window.');
  });
  await expect(ensureOrigins(['https://ai-gateway.vercel.sh/*'], [])).rejects.toThrow(
    /cannot ask for permission to reach ai-gateway\.vercel\.sh/,
  );
});
