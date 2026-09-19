import { Effect } from 'effect';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEvaluator, cacheKey } from '../src/background/evaluator';
import { ProviderError } from '../src/background/providers';
import { defaults } from '../src/common/settings';
import type { Post } from '../src/common/post';
import { mockChrome } from './chrome';

const post: Post = { key: '123', handle: 'alice', text: 'hello', images: [], context: '' };
beforeEach(() => mockChrome());
afterEach(() => vi.unstubAllGlobals());

it('deduplicates paid decisions across simultaneous callers and worker restarts', async () => {
  const classify = vi.fn(() =>
    Effect.succeed({
      verdicts: [{ key: post.key, hide: true, reason: 'bait' }],
      tokens: 7,
    }),
  );
  const evaluator = createEvaluator(classify);
  const [first, second] = await Promise.all([
    Effect.runPromise(evaluator.evaluate(defaults, [post])),
    Effect.runPromise(evaluator.evaluate(defaults, [post])),
  ]);
  expect(first).toEqual(second);
  expect(classify).toHaveBeenCalledTimes(1);
  await Effect.runPromise(createEvaluator(classify).evaluate(defaults, [post]));
  expect(classify).toHaveBeenCalledTimes(1);
});

it('does not cache omitted decisions or failures', async () => {
  const classify = vi.fn(() =>
    Effect.succeed({
      verdicts: [{ key: post.key, hide: false, reason: '', failed: true }],
      tokens: 7,
    }),
  );
  const evaluator = createEvaluator(classify);
  await Effect.runPromise(evaluator.evaluate(defaults, [post]));
  await Effect.runPromise(evaluator.evaluate(defaults, [post]));
  expect(classify).toHaveBeenCalledTimes(2);
});

it('does not overwrite an unreadable cache with an empty one', async () => {
  const { chrome } = mockChrome();
  chrome.storage.local.get.mockRejectedValueOnce(new Error('disk error'));
  const classify = vi.fn(() => Effect.succeed({ verdicts: [], tokens: 0 }));
  await expect(
    Effect.runPromise(createEvaluator(classify).evaluate(defaults, [post])),
  ).rejects.toThrow('disk error');
  expect(classify).not.toHaveBeenCalled();
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

it('releases the batch lock after a provider failure', async () => {
  let calls = 0;
  const evaluator = createEvaluator(() => {
    calls++;
    return calls === 1
      ? Effect.fail(new ProviderError({ message: 'unavailable' }))
      : Effect.succeed({ verdicts: [{ key: post.key, hide: false, reason: '' }], tokens: 1 });
  });
  await expect(Effect.runPromise(evaluator.evaluate(defaults, [post]))).rejects.toThrow(
    'unavailable',
  );
  await expect(Effect.runPromise(evaluator.evaluate(defaults, [post]))).resolves.toMatchObject([
    { hide: false },
  ]);
});

it('clears persisted decisions before the next evaluation', async () => {
  const classify = vi.fn(() =>
    Effect.succeed({
      verdicts: [{ key: post.key, hide: false, reason: '' }],
      tokens: 1,
    }),
  );
  const evaluator = createEvaluator(classify);
  await Effect.runPromise(evaluator.evaluate(defaults, [post]));
  await Effect.runPromise(evaluator.clear);
  await Effect.runPromise(evaluator.evaluate(defaults, [post]));
  expect(classify).toHaveBeenCalledTimes(2);
});

it('distinguishes image-only posts and edits but ignores mounted reply context', async () => {
  const key = (value: Post) => Effect.runPromise(cacheKey(defaults, value));
  expect(await key({ ...post, text: '', key: '1' })).not.toBe(
    await key({ ...post, text: '', key: '2' }),
  );
  expect(await key(post)).not.toBe(await key({ ...post, text: 'edited' }));
  expect(await key(post)).toBe(await key({ ...post, context: 'different mounted parent' }));
});

it('keeps a classifier score in the cache, and a trace only for the decision it came with', async () => {
  const trace = {
    source: 'classifier' as const,
    model: 'm',
    at: 1,
    images: [],
    request: { secret: 'post text' },
  };
  const classify = vi.fn(() =>
    Effect.succeed({
      verdicts: [{ key: post.key, hide: true, reason: 'Matches your filter', score: 0.91, trace }],
      tokens: 7,
    }),
  );
  const debug = { ...defaults, debug: true };
  const evaluator = createEvaluator(classify);
  const [fresh] = await Effect.runPromise(evaluator.evaluate(debug, [post]));
  expect(fresh).toMatchObject({ hide: true, score: 0.91, trace: { source: 'classifier' } });

  // Remembered: the score survives, the trace does not; it says where it came from.
  const [cached] = await Effect.runPromise(createEvaluator(classify).evaluate(debug, [post]));
  expect(classify).toHaveBeenCalledTimes(1);
  expect(cached).toMatchObject({ hide: true, score: 0.91, trace: { source: 'cache' } });
  expect(JSON.stringify(cached)).not.toContain('post text');

  // Without debug mode there is no trace at all.
  const [plain] = await Effect.runPromise(createEvaluator(classify).evaluate(defaults, [post]));
  expect(plain).toEqual({ key: post.key, hide: true, reason: 'Matches your filter', score: 0.91 });

  // The cached score is read against the hide line as it stands now, for free.
  const strict = { ...defaults, hideFrom: 0.95 };
  const [kept] = await Effect.runPromise(createEvaluator(classify).evaluate(strict, [post]));
  expect(kept).toEqual({ key: post.key, hide: false, reason: '', score: 0.91 });
  expect(classify).toHaveBeenCalledTimes(1);
});
