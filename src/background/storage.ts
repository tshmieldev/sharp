import { Effect, Schema } from 'effect';
import { attempt, OperationError } from '../common/errors';
import {
  defaults,
  MAX_CORRECTIONS,
  Settings,
  type SettingsPatch,
  type ListKey,
} from '../common/settings';
import type { Post } from '../common/post';
import type { CorrectionVerdict } from '../common/messages';
import { Stats } from '../common/messages';
import { withAuthorRule, type AuthorRule } from '../common/author-rules';

// One writer for settings, stats and cache mutations. No optimistic state to roll back.
export const storageLock = Effect.runSync(Effect.makeSemaphore(1));
export const readLocal = (key: string) => attempt(() => chrome.storage.local.get(key));
export const writeLocal = (data: Record<string, unknown>) =>
  attempt(() => chrome.storage.local.set(data));

const initializationLock = Effect.runSync(Effect.makeSemaphore(1));
let initialized = false;

export const getSettings = initializationLock.withPermits(1)(
  Effect.gen(function* () {
    const local = yield* readLocal('settings');
    if (!initialized) {
      if (local.settings === undefined) {
        const legacy = yield* attempt(() => chrome.storage.sync.get(null));
        const settings = yield* Schema.decodeUnknown(Settings)({ ...defaults, ...legacy });
        yield* writeLocal({ settings });
        local.settings = settings;
      }
      // Finish cleanup even if the previous worker stopped after the local write.
      yield* attempt(() => chrome.storage.sync.remove('apiKeys'));
      initialized = true;
    }
    // Settings saved by an older build lack fields added since; defaults fill
    // them in rather than failing the whole decode.
    const stored = typeof local.settings === 'object' && local.settings ? local.settings : {};
    return yield* Schema.decodeUnknown(Settings)({ ...defaults, ...stored });
  }),
);

export function patchSettings(patch: SettingsPatch) {
  return storageLock.withPermits(1)(
    Effect.gen(function* () {
      const previous = yield* getSettings;
      const next = { ...previous, ...patch };
      // A single-list edit wins over the previous opposite rule. A bulk edit must
      // be unambiguous, rather than silently choosing one of two user inputs.
      if (patch.allowedAuthors !== undefined && patch.blockedAuthors === undefined) {
        const allowed = new Set(patch.allowedAuthors.map((handle) => handle.toLowerCase()));
        next.blockedAuthors = next.blockedAuthors.filter(
          (handle) => !allowed.has(handle.toLowerCase()),
        );
      } else if (patch.blockedAuthors !== undefined && patch.allowedAuthors === undefined) {
        const blocked = new Set(patch.blockedAuthors.map((handle) => handle.toLowerCase()));
        next.allowedAuthors = next.allowedAuthors.filter(
          (handle) => !blocked.has(handle.toLowerCase()),
        );
      } else if (patch.allowedAuthors !== undefined && patch.blockedAuthors !== undefined) {
        const allowed = new Set(patch.allowedAuthors.map((handle) => handle.toLowerCase()));
        if (patch.blockedAuthors.some((handle) => allowed.has(handle.toLowerCase()))) {
          return yield* new OperationError({
            message: 'An author cannot be both allowed and blocked. Remove the conflicting rule.',
          });
        }
      }
      const settings = yield* Schema.decodeUnknown(Settings)(next);
      yield* writeLocal({ settings });
      return settings;
    }),
  );
}

export function setAuthorRule(handle: string, rule: AuthorRule) {
  return storageLock.withPermits(1)(
    Effect.gen(function* () {
      const settings = yield* getSettings;
      yield* writeLocal({ settings: { ...settings, ...withAuthorRule(settings, handle, rule) } });
    }),
  );
}

export function setThreadBypass(threadId: string, bypassed: boolean) {
  return storageLock.withPermits(1)(
    Effect.gen(function* () {
      const settings = yield* getSettings;
      const others = settings.bypassedThreads.filter((id) => id !== threadId);
      const bypassedThreads = bypassed ? [...others, threadId].slice(-200) : others;
      yield* writeLocal({ settings: { ...settings, bypassedThreads } });
    }),
  );
}

/** Remember how the reader judged a post, or withdraw that lesson. The newest
 *  correction of the same text wins, and the list is bounded so the prompt
 *  cannot grow without limit. */
export function setCorrection(post: Post, verdict: CorrectionVerdict) {
  return storageLock.withPermits(1)(
    Effect.gen(function* () {
      const settings = yield* getSettings;
      const text = post.text.trim().slice(0, 280);
      if (!text) return yield* new OperationError({ message: 'This post has no text to learn.' });
      const others = settings.corrections.filter((entry) => entry.text !== text);
      const corrections =
        verdict === 'forget'
          ? others
          : [...others, { handle: post.handle, text, hide: verdict === 'hide', at: Date.now() }];
      yield* writeLocal({
        settings: { ...settings, corrections: corrections.slice(-MAX_CORRECTIONS) },
      });
    }),
  );
}

export function toggleList(list: ListKey, value: string) {
  return storageLock.withPermits(1)(
    Effect.gen(function* () {
      const settings = yield* getSettings;
      const normalized = value.trim().replace(list === 'bypassedThreads' ? /^$/ : /^@/, '');
      if (!normalized) return yield* new OperationError({ message: 'Enter a non-empty value.' });
      const exists = settings[list].some(
        (entry) => entry.toLowerCase() === normalized.toLowerCase(),
      );
      if (list === 'allowedAuthors' || list === 'blockedAuthors') {
        const rule = exists ? 'default' : list === 'allowedAuthors' ? 'allow' : 'block';
        yield* writeLocal({
          settings: { ...settings, ...withAuthorRule(settings, normalized, rule) },
        });
        return !exists;
      }
      const next = exists
        ? settings[list].filter((entry) => entry.toLowerCase() !== normalized.toLowerCase())
        : [...settings[list], normalized].slice(list === 'bypassedThreads' ? -200 : -500);
      yield* writeLocal({ settings: { ...settings, [list]: next } });
      return !exists;
    }),
  );
}

export const emptyStats: Stats = { hidden: 0, requests: 0, tokens: 0 };
export const getStats = Effect.gen(function* () {
  const data = yield* readLocal('stats');
  const partial = yield* Schema.decodeUnknown(Schema.partial(Stats))(data.stats ?? {});
  return { ...emptyStats, ...partial };
});
export function bumpStats(patch: Partial<Stats>) {
  return storageLock.withPermits(1)(
    Effect.gen(function* () {
      const previous = yield* getStats;
      yield* writeLocal({
        stats: {
          hidden: previous.hidden + (patch.hidden ?? 0),
          requests: previous.requests + (patch.requests ?? 0),
          tokens: previous.tokens + (patch.tokens ?? 0),
        },
      });
    }),
  );
}
export const resetStats = storageLock.withPermits(1)(writeLocal({ stats: emptyStats }));

export function setStatus(error: string) {
  return Effect.gen(function* () {
    yield* writeLocal({ status: { error } });
    yield* attempt(() => chrome.action.setBadgeText({ text: error ? '!' : '' }));
    yield* attempt(() => chrome.action.setBadgeBackgroundColor({ color: '#d93025' }));
    yield* attempt(() =>
      chrome.action.setTitle({
        title: error ? `Sharp — ${error}` : 'Sharp',
      }),
    );
  });
}
