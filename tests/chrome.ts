import { vi } from 'vitest';

/** Promise-based Chrome storage double; clones values just like the real API. */
export function mockChrome(
  initial: Record<string, unknown> = {},
  legacy: Record<string, unknown> = {},
) {
  const local = structuredClone(initial);
  const sync = structuredClone(legacy);
  const area = (data: Record<string, unknown>) => ({
    get: vi.fn(async (key: string | null) =>
      structuredClone(key === null ? data : { [key]: data[key] }),
    ),
    set: vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(data, structuredClone(values));
    }),
    remove: vi.fn(async (key: string) => {
      delete data[key];
    }),
    getBytesInUse: vi.fn(async () => JSON.stringify(data).length),
  });
  const chrome = {
    storage: {
      local: area(local),
      sync: area(sync),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { id: 'extension-id', sendMessage: vi.fn() },
    action: {
      setBadgeText: vi.fn(async () => {}),
      setBadgeBackgroundColor: vi.fn(async () => {}),
      setTitle: vi.fn(async () => {}),
    },
  };
  vi.stubGlobal('chrome', chrome);
  return { chrome, local, sync };
}
