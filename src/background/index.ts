import { Effect, Schema } from 'effect';
import { errorMessage, OperationError } from '../common/errors';
import { Request } from '../common/messages';
import { threadId } from '../common/post';
import { decisionScope, publicSettings } from '../common/settings';
import { createEvaluator } from './evaluator';
import { classify, listEndpoints, listModels } from './providers';
import {
  bumpStats,
  getSettings,
  getStats,
  patchSettings,
  readLocal,
  resetStats,
  setAuthorRule,
  setStatus,
  setThreadBypass,
  toggleList,
} from './storage';

const evaluator = createEvaluator();
const contentRequests = new Set<Request['type']>([
  'GET_PUBLIC_SETTINGS',
  'EVALUATE',
  'STAT_HIDDEN',
  'TOGGLE_LIST',
  'SET_AUTHOR_RULE',
  'SET_THREAD_BYPASS',
]);

function handle(message: Request) {
  return Effect.gen(function* () {
    switch (message.type) {
      case 'GET_SETTINGS':
        return yield* getSettings;
      case 'GET_PUBLIC_SETTINGS':
        return publicSettings(yield* getSettings);
      case 'PATCH_SETTINGS':
        return yield* patchSettings(message.patch);
      case 'SET_AUTHOR_RULE':
        return yield* setAuthorRule(message.handle, message.rule);
      case 'SET_THREAD_BYPASS':
        return yield* setThreadBypass(message.threadId, message.bypassed);
      case 'TOGGLE_LIST':
        return yield* toggleList(message.list, message.value);
      case 'EVALUATE': {
        const settings = yield* getSettings;
        if (!settings.enabled || decisionScope(settings) !== message.scope) {
          return message.items.map((item) => ({
            key: item.key,
            hide: false,
            reason: '',
            failed: true,
          }));
        }
        return yield* evaluator
          .evaluate(settings, message.items)
          .pipe(Effect.tapError((error) => setStatus(errorMessage(error))));
      }
      case 'STAT_HIDDEN':
        return yield* bumpStats({ hidden: message.count });
      case 'LIST_MODELS':
        return yield* listModels(yield* getSettings);
      case 'LIST_ENDPOINTS':
        return yield* listEndpoints(yield* getSettings, message.model);
      case 'TEST_CONNECTION': {
        const settings = yield* getSettings;
        yield* classify(settings, [
          {
            key: 'probe',
            handle: 'jack',
            text: 'just setting up my twttr',
            images: [],
            context: '',
          },
        ]);
        yield* setStatus('');
        return `Connected to ${settings.model}`;
      }
      case 'GET_STATS':
        return yield* getStats;
      case 'GET_STATUS': {
        const stored = yield* readLocal('status');
        return yield* Schema.decodeUnknown(Schema.Struct({ error: Schema.String }))(
          stored.status ?? { error: '' },
        );
      }
      case 'RESET_STATS':
        return yield* resetStats;
      case 'CLEAR_CACHE':
        return yield* evaluator.clear;
      case 'CACHE_SIZE':
        return yield* evaluator.size;
    }
  });
}

chrome.runtime.onMessage.addListener((raw: unknown, sender, respond) => {
  const program = Effect.gen(function* () {
    if (sender.id !== chrome.runtime.id)
      return yield* new OperationError({ message: 'Untrusted sender.' });
    const message = yield* Schema.decodeUnknown(Request)(raw);
    const fromPopup = !sender.tab && sender.url === chrome.runtime.getURL('popup.html');
    const fromTimeline = sender.tab && /^https:\/\/(?:x|twitter)\.com\//.test(sender.url ?? '');
    if (!fromPopup && !(fromTimeline && contentRequests.has(message.type))) {
      return yield* new OperationError({
        message: 'This operation is not available to content scripts.',
      });
    }
    return yield* handle(message);
  });
  Effect.runPromise(
    program.pipe(
      Effect.match({
        onSuccess: (result) => ({ ok: true, result }),
        onFailure: (error) => ({ ok: false, error: errorMessage(error) }),
      }),
    ),
  ).then(respond, () =>
    respond({ ok: false, error: 'Unexpected extension error. Reload the extension.' }),
  );
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  const operation = Effect.gen(function* () {
    if (command === 'toggle-filtering') {
      const settings = yield* getSettings;
      yield* patchSettings({ enabled: !settings.enabled });
    } else if (command === 'toggle-thread') {
      const tabs = yield* Effect.promise(() =>
        chrome.tabs.query({ active: true, currentWindow: true }),
      );
      const url = tabs[0]?.url;
      if (!url || !/^https:\/\/(?:x|twitter)\.com\//.test(url)) return;
      const id = threadId(new URL(url).pathname);
      if (id) yield* toggleList('bypassedThreads', id);
    }
  });
  void Effect.runPromise(
    operation.pipe(Effect.catchAll((error) => setStatus(errorMessage(error)))),
  ).catch(console.error);
});
