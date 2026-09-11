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
/** A post the reader overruled. Sent with every batch as an example of their judgement. */
export const Correction = Schema.Struct({
  handle: Schema.String.pipe(Schema.maxLength(30)),
  text: Schema.String.pipe(Schema.maxLength(280)),
  hide: Schema.Boolean,
  at: Schema.Number,
});
export type Correction = typeof Correction.Type;
export const MAX_CORRECTIONS = 12;

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
  corrections: Schema.Array(Correction).pipe(Schema.maxItems(MAX_CORRECTIONS)),
  notInterested: Schema.Boolean,
  analyzeImages: Schema.Boolean,
  maxImagesPerPost: boundedInt(1, 4),
  hideStyle: Schema.Literal('collapse', 'blur'),
  showAuthor: Schema.Boolean,
  hideFully: Schema.Boolean,
  motion: Schema.Literal('auto', 'full', 'reduced'),
  lookahead: Schema.Number.pipe(Schema.int(), Schema.clamp(0, 500)),
  allowedAuthors: list,
  blockedAuthors: list,
  blockedWords: list,
  bypassedThreads: list.pipe(Schema.maxItems(200)),
  favorites: Schema.Array(Favorite),
  batchSize: boundedInt(1, 30),
  concurrency: boundedInt(1, 6),
  // YouTube: plain page rules, applied by the stylesheet alone.
  youtubeEnabled: Schema.Boolean,
  hideShorts: Schema.Boolean,
  thumbnails: Schema.Literal('shown', 'blurred', 'hidden'),
  hideComments: Schema.Boolean,
  // Misc page rules, per site: wash the chrome, the content, or both, of colour.
  greyscaleUi: Schema.Boolean,
  greyscaleContent: Schema.Boolean,
  youtubeGreyscaleUi: Schema.Boolean,
  youtubeGreyscaleContent: Schema.Boolean,
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
  corrections: [],
  notInterested: false,
  analyzeImages: false,
  maxImagesPerPost: 2,
  hideStyle: 'collapse',
  showAuthor: true,
  hideFully: false,
  motion: 'auto',
  lookahead: 200,
  allowedAuthors: [],
  blockedAuthors: [],
  blockedWords: [],
  bypassedThreads: [],
  favorites: [],
  batchSize: 12,
  concurrency: 3,
  youtubeEnabled: true,
  hideShorts: false,
  thumbnails: 'shown',
  hideComments: false,
  greyscaleUi: false,
  greyscaleContent: false,
  youtubeGreyscaleUi: false,
  youtubeGreyscaleContent: false,
};

/** How much to spend on speed. Bigger batches mean fewer requests, and each
 *  request carries the same instruction overhead, so fewer is cheaper; more
 *  requests in flight settle the timeline sooner. */
export const spendPresets = {
  low: { label: 'Low', cost: '$', batchSize: 20, concurrency: 1 },
  medium: { label: 'Medium', cost: '$$', batchSize: 12, concurrency: 3 },
  high: { label: 'High', cost: '$$$', batchSize: 6, concurrency: 5 },
} as const;
export type SpendPreset = keyof typeof spendPresets | 'custom';
export function spendPreset(settings: Pick<Settings, 'batchSize' | 'concurrency'>): SpendPreset {
  for (const [key, preset] of Object.entries(spendPresets)) {
    if (preset.batchSize === settings.batchSize && preset.concurrency === settings.concurrency)
      return key as SpendPreset;
  }
  return 'custom';
}

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

/** Only inputs that change an AI decision invalidate paid verdicts. Corrections
 *  are deliberately left out: they steer future batches, and the corrected post
 *  itself is written straight into the cache, so nothing already paid for is
 *  thrown away each time the reader overrules one verdict. */
/** Bump when the system prompt changes in a way that should re-judge cached
 *  posts. Cached verdicts are keyed on this, so a bump re-buys the visible
 *  timeline once; leave it alone for wording that cannot change a verdict. */
export const PROMPT_VERSION = 2;

export function decisionScope(settings: PublicSettings | Settings): string {
  return JSON.stringify([
    PROMPT_VERSION,
    settings.provider,
    settings.provider === 'custom' ? settings.customBaseUrl : '',
    settings.model,
    settings.routingProvider,
    settings.criteria,
    settings.analyzeImages,
    settings.maxImagesPerPost,
  ]);
}
