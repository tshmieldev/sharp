import { Effect } from 'effect';
import { afterEach, expect, it, vi } from 'vitest';
import { classify, classificationBody, endpoint } from '../src/background/providers';
import { parseVerdicts } from '../src/background/verdicts';
import { defaults } from '../src/common/settings';

const settings = { ...defaults, apiKeys: { openrouter: 'test-key' } };
const posts = [
  { key: '1', handle: 'alice', text: 'hello', images: [], context: '' },
  { key: '2', handle: 'bob', text: 'hi', images: [], context: '' },
];
afterEach(() => vi.unstubAllGlobals());

it('accepts fences, wrappers and string booleans without inventing verdicts', () => {
  expect(parseVerdicts('```json\n[{"id":1,"hide":"true","reason":"bait"}]\n```')).toEqual([
    { id: '1', hide: true, reason: 'bait' },
  ]);
  expect(parseVerdicts('{"results":[{"id":"2","hide":false}]}')[0]?.hide).toBe(false);
  expect(parseVerdicts('[{"id":"1"},{"id":"2","hide":"maybe"}]')).toEqual([]);
  expect(parseVerdicts('not json')).toEqual([]);
});

it('marks missing model decisions as failed, not durable show decisions', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: '[{"id":"1","hide":true,"reason":"bait"}]' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    ),
  );
  const result = await Effect.runPromise(classify(settings, posts));
  expect(result.tokens).toBe(15);
  expect(result.verdicts[1]).toEqual({ key: '2', hide: false, reason: '', failed: true });
});

it('retains usage for a paid but malformed response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: 'no' } }],
        usage: { total_tokens: 23 },
      }),
    ),
  );
  const result = await Effect.runPromise(Effect.either(classify(settings, posts)));
  expect(result._tag).toBe('Left');
  if (result._tag === 'Left') expect(result.left).toMatchObject({ tokens: 23 });
});

it('does not leak provider error bodies', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('secret-key-and-post-text', { status: 401 })),
  );
  await expect(Effect.runPromise(classify(settings, posts))).rejects.toThrow('Check your API key');
  await expect(Effect.runPromise(classify(settings, posts))).rejects.not.toThrow(
    'secret-key-and-post-text',
  );
});

it('handles HTTP 200 error envelopes', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ error: { message: 'private details' } })),
  );
  await expect(Effect.runPromise(classify(settings, posts))).rejects.toThrow(
    'Provider returned an error',
  );
});

it('uses each provider protocol and avoids temperature for reasoning models', () => {
  const images = [{ ...posts[0]!, images: ['https://pbs.twimg.com/media/photo.jpg'] }];
  const anthropic = classificationBody(
    { ...settings, provider: 'anthropic', analyzeImages: true },
    images,
  );
  expect(anthropic).toHaveProperty('system');
  expect(JSON.stringify(anthropic)).toContain('"source":{"type":"url"');
  const openai = classificationBody({ ...settings, provider: 'openai', model: 'gpt-5' }, posts);
  expect(openai).not.toHaveProperty('temperature');
  expect(openai).toHaveProperty('max_completion_tokens');
  expect(classificationBody(settings, posts)).toHaveProperty('provider', { sort: 'throughput' });
});

it('rejects insecure or credential-bearing custom endpoints', () => {
  expect(() =>
    endpoint({ ...settings, provider: 'custom', customBaseUrl: 'http://localhost/v1' }),
  ).toThrow('HTTPS');
  expect(() =>
    endpoint({ ...settings, provider: 'custom', customBaseUrl: 'https://key@example.com/v1' }),
  ).toThrow('HTTPS');
  expect(
    endpoint({ ...settings, provider: 'custom', customBaseUrl: 'https://example.com/v1/' }),
  ).toBe('https://example.com/v1');
});

it('aborts a stalled provider request at the deadline', async () => {
  vi.useFakeTimers();
  let aborted = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) =>
          options.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('Aborted', 'AbortError'));
          }),
        ),
    ),
  );
  try {
    const result = Effect.runPromise(Effect.either(classify(settings, posts)));
    await vi.advanceTimersByTimeAsync(26000);
    expect((await result)._tag).toBe('Left');
    expect(aborted).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
