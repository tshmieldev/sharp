import { Schema } from 'effect';

export const Provider = Schema.Literal('openrouter', 'openai', 'anthropic', 'custom');
export type Provider = typeof Provider.Type;
export const ListKey = Schema.Literal(
  'allowedAuthors',
  'blockedAuthors',
  'blockedWords',
  'bypassedThreads',
);
export type ListKey = typeof ListKey.Type;
const boundedInt = (min: number, max: number) =>
  Schema.Number.pipe(Schema.int(), Schema.between(min, max));
const list = Schema.Array(Schema.String.pipe(Schema.maxLength(200))).pipe(Schema.maxItems(500));
const Favorite = Schema.Struct({
  provider: Schema.optional(Provider),
  model: Schema.String,
  routingProvider: Schema.optional(Schema.String),
  providerName: Schema.optional(Schema.String),
});
const Preset = Schema.Struct({ name: Schema.String, criteria: Schema.String });

export const Settings = Schema.Struct({
  enabled: Schema.Boolean,
  provider: Provider,
  apiKeys: Schema.Record({ key: Schema.String, value: Schema.String }),
  customBaseUrl: Schema.String,
  model: Schema.String,
  routingSort: Schema.Literal('throughput', 'latency', 'price'),
  routingProvider: Schema.String,
  criteria: Schema.String.pipe(Schema.maxLength(6000)),
  presets: Schema.Array(Preset),
  analyzeImages: Schema.Boolean,
  maxImagesPerPost: boundedInt(1, 4),
  hideStyle: Schema.Literal('collapse', 'blur'),
  motion: Schema.Literal('auto', 'full', 'reduced'),
  lookahead: Schema.Number.pipe(Schema.int(), Schema.clamp(0, 500)),
  allowedAuthors: list,
  blockedAuthors: list,
  blockedWords: list,
  bypassedThreads: list.pipe(Schema.maxItems(200)),
  favorites: Schema.Array(Favorite),
  batchSize: boundedInt(1, 30),
  imageBatchSize: boundedInt(1, 10),
});
export type Settings = typeof Settings.Type;
export const SettingsPatch = Schema.partial(Settings);
export type SettingsPatch = typeof SettingsPatch.Type;
export type PublicSettings = Omit<Settings, 'apiKeys'> & { readonly configured: boolean };

export const defaults: Settings = {
  enabled: true,
  provider: 'openrouter',
  apiKeys: {},
  customBaseUrl: '',
  model: 'google/gemma-4-31b-it',
  routingSort: 'throughput',
  routingProvider: '',
  criteria: 'Hide engagement bait, rage bait and low-effort AI-generated slop.',
  presets: [],
  analyzeImages: false,
  maxImagesPerPost: 2,
  hideStyle: 'collapse',
  motion: 'auto',
  lookahead: 200,
  allowedAuthors: [],
  blockedAuthors: [],
  blockedWords: [],
  bypassedThreads: [],
  favorites: [],
  batchSize: 12,
  imageBatchSize: 5,
};

export const providers = {
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  anthropic: { label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1' },
  custom: { label: 'Custom (OpenAI-compatible)', baseUrl: '' },
} satisfies Record<Provider, { label: string; baseUrl: string }>;

export function publicSettings(settings: Settings): PublicSettings {
  const { apiKeys, ...rest } = settings;
  return {
    ...rest,
    configured: Boolean(apiKeys[settings.provider] && settings.model && settings.criteria.trim()),
  };
}

/** Only inputs that change an AI decision invalidate paid verdicts. */
export function decisionScope(settings: PublicSettings | Settings): string {
  return JSON.stringify([
    settings.provider,
    settings.provider === 'custom' ? settings.customBaseUrl : '',
    settings.model,
    settings.routingProvider,
    settings.criteria,
    settings.analyzeImages,
    settings.maxImagesPerPost,
  ]);
}
