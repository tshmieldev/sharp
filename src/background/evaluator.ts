import { Effect, Schema } from 'effect';
import { attempt } from '../common/errors';
import type { Post, Verdict } from '../common/post';
import { decisionScope, type Settings } from '../common/settings';
import { classify } from './providers';
import { bumpStats, readLocal, setStatus, writeLocal } from './storage';

const CacheEntry = Schema.Struct({
  hide: Schema.Boolean,
  reason: Schema.String,
  unsure: Schema.optional(Schema.Boolean),
  at: Schema.Number,
});
const Cache = Schema.Record({ key: Schema.String, value: CacheEntry });
type Cache = typeof Cache.Type;
const CACHE_KEY = 'verdicts:v4';
const TTL = 7 * 24 * 60 * 60 * 1000;
const LIMIT = 4000;

export function cacheKey(settings: Settings, post: Post) {
  // Post id distinguishes image-only tweets; text catches edits to the same tweet.
  // Mounted reply context and thumbnails vary during scrolling and aren't identity.
  const value = JSON.stringify([decisionScope(settings), post.key, post.handle, post.text]);
  return attempt(async () => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  });
}

/** Serial batches deduplicate across tabs and bound provider pressure. Cache writes
 * finish before replying: MV3 can suspend the worker before a delayed flush runs. */
export function createEvaluator(runClassification = classify) {
  const lock = Effect.runSync(Effect.makeSemaphore(1));
  const load = Effect.gen(function* () {
    const stored = yield* readLocal(CACHE_KEY);
    return yield* Schema.decodeUnknown(Cache)(stored[CACHE_KEY] ?? {});
  });
  const clear = lock.withPermits(1)(attempt(() => chrome.storage.local.remove(CACHE_KEY)));

  /** The lock covers the cache read and the cache write, never the provider
   *  call, so requests overlap. The merge re-reads under the lock rather than
   *  writing back the snapshot it started from, so overlapping batches cannot
   *  drop each other's verdicts. */
  function evaluate(settings: Settings, posts: readonly Post[]) {
    return Effect.gen(function* () {
      const keys = yield* Effect.forEach(posts, (post) => cacheKey(settings, post));
      const cache = yield* lock.withPermits(1)(load);
      const now = Date.now();
      const unique = new Map<string, Post>();
      posts.forEach((post, index) => {
        const key = keys[index]!;
        if (!cache[key] || now - cache[key].at > TTL) unique.set(key, post);
      });
      const updates: Record<string, typeof CacheEntry.Type> = {};
      if (unique.size) {
        // A paid request is never automatically retried here. The content controller
        // owns a bounded retry budget and leaves the timeline visible on failure.
        yield* bumpStats({ requests: 1 });
        const result = yield* runClassification(settings, [...unique.values()]).pipe(
          Effect.tapError((error) =>
            bumpStats({
              tokens: 'tokens' in error && typeof error.tokens === 'number' ? error.tokens : 0,
            }),
          ),
        );
        yield* bumpStats({ tokens: result.tokens });
        const byId = new Map(result.verdicts.map((verdict) => [verdict.key, verdict]));
        for (const [key, post] of unique) {
          const verdict = byId.get(post.key);
          if (verdict && !verdict.failed)
            updates[key] = {
              hide: verdict.hide,
              reason: verdict.reason,
              ...(verdict.unsure ? { unsure: true } : {}),
              at: now,
            };
        }
        yield* lock.withPermits(1)(
          Effect.gen(function* () {
            const current = yield* load;
            const next = Object.fromEntries(
              Object.entries({ ...current, ...updates })
                .filter(([, entry]) => now - entry.at <= TTL)
                .sort((a, b) => b[1].at - a[1].at)
                .slice(0, LIMIT),
            );
            yield* writeLocal({ [CACHE_KEY]: next });
          }),
        );
        yield* setStatus(
          result.verdicts.some((verdict) => verdict.failed)
            ? 'The model skipped some posts. They remain visible.'
            : '',
        );
      }
      return posts.map((post, index): Verdict => {
        const key = keys[index]!;
        const entry = updates[key] ?? cache[key];
        return entry && now - entry.at <= TTL
          ? {
              key: post.key,
              hide: entry.hide,
              reason: entry.reason,
              ...(entry.unsure ? { unsure: true } : {}),
            }
          : { key: post.key, hide: false, reason: '', failed: true };
      });
    }).pipe(Effect.timeout('32 seconds'));
  }

  /** A correction is a verdict the reader already paid for with their attention:
   *  store it like one, so the post stays decided across reloads and remounts. */
  function override(settings: Settings, post: Post, hide: boolean) {
    return Effect.gen(function* () {
      const key = yield* cacheKey(settings, post);
      yield* lock.withPermits(1)(
        Effect.gen(function* () {
          const current = yield* load;
          const now = Date.now();
          const entry = { hide, reason: hide ? 'Your correction' : '', at: now };
          const next = Object.fromEntries(
            Object.entries({ ...current, [key]: entry })
              .filter(([, value]) => now - value.at <= TTL)
              .sort((a, b) => b[1].at - a[1].at)
              .slice(0, LIMIT),
          );
          yield* writeLocal({ [CACHE_KEY]: next });
        }),
      );
    });
  }

  return {
    evaluate,
    override,
    clear,
    size: attempt(() => chrome.storage.local.getBytesInUse(CACHE_KEY)),
  };
}
