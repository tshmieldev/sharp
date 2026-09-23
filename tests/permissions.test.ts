// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { ensureOrigins } from '../src/popup/App';

function mockPermissions(granted: string[], request?: () => Promise<boolean>) {
  const requested: string[][] = [];
  vi.stubGlobal('chrome', {
    permissions: {
      contains: vi.fn(async ({ origins }: { origins: string[] }) =>
        origins.every((origin) => granted.includes(origin)),
      ),
      request: vi.fn(async ({ origins }: { origins: string[] }) => {
        requested.push(origins);
        return request ? request() : true;
      }),
    },
  });
  return requested;
}
afterEach(() => vi.unstubAllGlobals());

it('never shows a prompt for origins the browser already allows', async () => {
  // Kiwi opens the popup as a tab with no window to draw a prompt in, so a
  // request for OpenRouter, granted at install, would fail and block the save.
  const requested = mockPermissions(['https://openrouter.ai/*']);
  await expect(ensureOrigins(['https://openrouter.ai/*'])).resolves.toBeUndefined();
  expect(requested).toEqual([]);
});

it('asks only for what is missing, and fails the save if that is refused', async () => {
  let requested = mockPermissions(['https://openrouter.ai/*']);
  await ensureOrigins(['https://openrouter.ai/*', 'https://ai-gateway.vercel.sh/*']);
  expect(requested).toEqual([['https://ai-gateway.vercel.sh/*']]);

  requested = mockPermissions([], async () => false);
  await expect(ensureOrigins(['https://api.typesafe.ai/*'])).rejects.toThrow('not granted');
});

it('explains a prompt the browser cannot show, naming the host', async () => {
  mockPermissions([], async () => {
    throw new Error('No active window.');
  });
  await expect(ensureOrigins(['https://ai-gateway.vercel.sh/*'])).rejects.toThrow(
    /cannot ask for permission to reach ai-gateway\.vercel\.sh/,
  );
});
