import { Effect, Schema } from 'effect';
import { attempt, OperationError } from './errors';
import { Post, Verdict } from './post';

/** keep/hide teach the model; forget withdraws the lesson. */
export const CorrectionVerdict = Schema.Literal('keep', 'hide', 'forget');
export type CorrectionVerdict = typeof CorrectionVerdict.Type;
import { defaults, ListKey, Settings, SettingsPatch } from './settings';
import { AuthorHandle, AuthorRule } from './author-rules';

export const Stats = Schema.Struct({
  hidden: Schema.Number,
  requests: Schema.Number,
  tokens: Schema.Number,
});
export type Stats = typeof Stats.Type;
const optionalNumber = Schema.optional(Schema.Number);
export const Model = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  vision: Schema.Boolean,
  context: optionalNumber,
  promptPrice: optionalNumber,
  completionPrice: optionalNumber,
  created: optionalNumber,
  rank: optionalNumber,
});
export type Model = typeof Model.Type;
export const ModelEndpoint = Schema.Struct({
  name: Schema.String,
  tag: Schema.String,
  quantization: Schema.optional(Schema.String),
  context: optionalNumber,
  promptPrice: optionalNumber,
  completionPrice: optionalNumber,
  uptime: optionalNumber,
  latency: optionalNumber,
  throughput: optionalNumber,
});
export type ModelEndpoint = typeof ModelEndpoint.Type;
const PublicSettings = Settings.pipe(Schema.omit('apiKeys')).pipe(
  Schema.extend(Schema.Struct({ configured: Schema.Boolean })),
);
const Status = Schema.Struct({ error: Schema.String });
export const Request = Schema.Union(
  Schema.Struct({ type: Schema.Literal('GET_SETTINGS') }),
  Schema.Struct({ type: Schema.Literal('GET_PUBLIC_SETTINGS') }),
  Schema.Struct({ type: Schema.Literal('PATCH_SETTINGS'), patch: SettingsPatch }),
  Schema.Struct({
    type: Schema.Literal('SET_AUTHOR_RULE'),
    handle: AuthorHandle,
    rule: AuthorRule,
  }),
  Schema.Struct({
    type: Schema.Literal('SET_THREAD_BYPASS'),
    threadId: Schema.String.pipe(Schema.pattern(/^\d+$/), Schema.maxLength(200)),
    bypassed: Schema.Boolean,
  }),
  Schema.Struct({
    type: Schema.Literal('TOGGLE_LIST'),
    list: ListKey,
    value: Schema.String.pipe(Schema.maxLength(200)),
  }),
  Schema.Struct({
    type: Schema.Literal('EVALUATE'),
    scope: Schema.String,
    items: Schema.Array(Post).pipe(Schema.maxItems(30)),
  }),
  Schema.Struct({
    type: Schema.Literal('CORRECT_VERDICT'),
    post: Post,
    verdict: CorrectionVerdict,
  }),
  Schema.Struct({
    type: Schema.Literal('STAT_HIDDEN'),
    count: Schema.Number.pipe(Schema.int(), Schema.between(1, 1000)),
  }),
  Schema.Struct({ type: Schema.Literal('LIST_MODELS') }),
  Schema.Struct({
    type: Schema.Literal('LIST_ENDPOINTS'),
    model: Schema.String.pipe(Schema.maxLength(200)),
  }),
  Schema.Struct({ type: Schema.Literal('TEST_CONNECTION') }),
  Schema.Struct({ type: Schema.Literal('GET_STATS') }),
  Schema.Struct({ type: Schema.Literal('GET_STATUS') }),
  Schema.Struct({ type: Schema.Literal('RESET_STATS') }),
  Schema.Struct({ type: Schema.Literal('CLEAR_CACHE') }),
  Schema.Struct({ type: Schema.Literal('CACHE_SIZE') }),
);
export type Request = typeof Request.Type;

export const responses = {
  GET_SETTINGS: Settings,
  GET_PUBLIC_SETTINGS: PublicSettings,
  PATCH_SETTINGS: Settings,
  SET_AUTHOR_RULE: Schema.Void,
  SET_THREAD_BYPASS: Schema.Void,
  TOGGLE_LIST: Schema.Boolean,
  EVALUATE: Schema.Array(Verdict),
  CORRECT_VERDICT: Schema.Void,
  STAT_HIDDEN: Schema.Void,
  LIST_MODELS: Schema.Array(Model),
  LIST_ENDPOINTS: Schema.Array(ModelEndpoint),
  TEST_CONNECTION: Schema.String,
  GET_STATS: Stats,
  GET_STATUS: Status,
  RESET_STATS: Schema.Void,
  CLEAR_CACHE: Schema.Void,
  CACHE_SIZE: Schema.Number,
};
type Response<T extends Request['type']> = (typeof responses)[T]['Type'];
const settingsResponses = new Set<Request['type']>([
  'GET_SETTINGS',
  'GET_PUBLIC_SETTINGS',
  'PATCH_SETTINGS',
]);
const Envelope = Schema.Union(
  Schema.Struct({ ok: Schema.Literal(true), result: Schema.optional(Schema.Unknown) }),
  Schema.Struct({ ok: Schema.Literal(false), error: Schema.String }),
);

/** Chrome and Promise interop lives at this boundary; callers get validated data. */
export function request<T extends Request>(message: T): Promise<Response<T['type']>> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const raw: unknown = yield* attempt(() => chrome.runtime.sendMessage(message));
      const envelope = yield* Schema.decodeUnknown(Envelope)(raw);
      if (!envelope.ok) return yield* new OperationError({ message: envelope.error });
      // Indexing a heterogeneous schema map loses the key/result relationship in TS.
      const schema = responses[message.type] as Schema.Schema<Response<T['type']>>;
      // An unpacked rebuild swaps this script at once but leaves the old worker
      // running until the extension is reloaded. Its settings lack fields added
      // since; defaults fill them in rather than failing the whole popup or tab.
      const result =
        settingsResponses.has(message.type) && typeof envelope.result === 'object'
          ? { ...defaults, ...envelope.result }
          : envelope.result;
      return yield* Schema.decodeUnknown(schema)(result);
    }).pipe(Effect.timeout('40 seconds')),
  );
}
