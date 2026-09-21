import { Schema } from 'effect';
import type { Verdict } from './post';

/** The decision model, fixed: a classifier needs a model trained to answer
 *  typed questions, and today there is one. */
export const CLASSIFIER_MODEL = 'typesafe/jev-1.13';
export const DEFAULT_VISION_MODEL = 'google/gemma-4-26b-a4b-it';
/** The default before it, in builds that were never released. */
const FORMER_VISION_MODEL = 'google/gemini-2.5-flash-lite';

export const Provider = Schema.Literal('openrouter', 'openai', 'anthropic', 'custom');
export type Provider = typeof Provider.Type;
/** Where the classifier is reached. It has a key of its own, apart from the
 *  chat model's, so either can be set up without the other. */
export const ClassifierProvider = Schema.Literal('openrouter', 'vercel', 'typesafe');
export type ClassifierProvider = typeof ClassifierProvider.Type;
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
  filterComments: Schema.Boolean,
  /** Who makes the hide-or-show call: a decision model, or a chat model. */
  decisionMode: Schema.Literal('classifier', 'llm'),
  classifierProvider: ClassifierProvider,
  /** A classifier hides a post it scores at or over this. */
  hideFrom: Schema.Number.pipe(Schema.clamp(0, 1)),
  /** A hide within this much of `hideFrom` is a close call. */
  closeCallMargin: Schema.Number.pipe(Schema.clamp(0, 1)),
  /** Turns images into text for a classifier, which cannot see them. */
  visionModel: Schema.String,
  /** A post the classifier scores inside this range from its text alone gets
   *  a second look with its images described. An empty range never looks. */
  imageCheckFrom: Schema.Number.pipe(Schema.clamp(0, 1)),
  imageCheckBelow: Schema.Number.pipe(Schema.clamp(0, 1)),
  /** Record what was sent, returned and how long it took, per post. */
  debug: Schema.Boolean,
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
  concurrency: boundedInt(1, 12),
  /** Classifier only: posts judged at once. Each post is its own request. */
  classifierConcurrency: boundedInt(1, 64),
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
  filterComments: false,
  decisionMode: 'classifier',
  classifierProvider: 'openrouter',
  hideFrom: 0.5,
  closeCallMargin: 0.3,
  visionModel: DEFAULT_VISION_MODEL,
  imageCheckFrom: 0.5,
  imageCheckBelow: 0.8,
  debug: false,
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
  classifierConcurrency: 16,
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

/** The pages Sharp filters. Declared in the manifest, but Firefox treats
 *  host permissions as optional even when they are declared, so the popup has
 *  to be able to ask for them. */
export const siteOrigins = [
  'https://x.com/*',
  'https://twitter.com/*',
  'https://www.youtube.com/*',
  'https://m.youtube.com/*',
] as const;

/** The same classifier, sold three ways. Each takes its own key. `chat` is an
 *  OpenAI-compatible endpoint under the same key, which is what describes
 *  images; TypeSafe has none, so it borrows one of the other two. */
export const classifierProviders = {
  openrouter: {
    label: 'OpenRouter',
    model: CLASSIFIER_MODEL,
    origin: 'https://openrouter.ai/*',
    url: 'https://openrouter.ai/api/alpha/decisions',
    chat: 'https://openrouter.ai/api/v1/chat/completions',
    keys: 'https://openrouter.ai/keys',
  },
  vercel: {
    label: 'Vercel AI Gateway',
    model: 'typesafe-ai/jev',
    origin: 'https://ai-gateway.vercel.sh/*',
    url: 'https://ai-gateway.vercel.sh/v4/ai/evaluation-model',
    chat: 'https://ai-gateway.vercel.sh/v1/chat/completions',
    keys: 'https://vercel.com/docs/ai-gateway',
  },
  typesafe: {
    label: 'TypeSafe AI',
    model: 'jev-latest',
    origin: 'https://api.typesafe.ai/*',
    url: 'https://api.typesafe.ai/v1/systemone',
    chat: '',
    keys: 'https://typesafe.ai',
  },
} satisfies Record<
  ClassifierProvider,
  { label: string; model: string; origin: string; url: string; chat: string; keys: string }
>;

/** Who describes images for the classifier: its own provider where that has a
 *  chat endpoint, otherwise whichever of the others has a key. */
export function visionProvider(
  settings: Pick<Settings, 'classifierProvider' | 'apiKeys'>,
): ClassifierProvider | null {
  if (classifierProviders[settings.classifierProvider].chat) return settings.classifierProvider;
  return (['openrouter', 'vercel'] as const).find((provider) => settings.apiKeys[provider]) ?? null;
}

/** Every origin the saved settings will call, for the permission prompt. */
export function apiOrigins(
  settings: Pick<
    Settings,
    | 'decisionMode'
    | 'classifierProvider'
    | 'apiKeys'
    | 'analyzeImages'
    | 'provider'
    | 'customBaseUrl'
  >,
): readonly string[] {
  if (!usesClassifier(settings)) return providerOrigins(settings);
  const vision = settings.analyzeImages ? visionProvider(settings) : null;
  return [
    ...new Set([
      classifierProviders[settings.classifierProvider].origin,
      ...(vision ? [classifierProviders[vision].origin] : []),
    ]),
  ];
}

/** The origin the configured provider is reached at, if it has a usable one. A
 *  half-typed custom URL has none, and is not worth an error here: saving
 *  validates it properly. */
export function providerOrigins(
  settings: Pick<Settings, 'provider' | 'customBaseUrl'>,
): readonly string[] {
  const base =
    settings.provider === 'custom' ? settings.customBaseUrl : providers[settings.provider].baseUrl;
  if (!base) return [];
  try {
    const url = new URL(base);
    return url.protocol === 'https:' ? [`${url.origin}/*`] : [];
  } catch {
    return [];
  }
}

/** How the page hands posts to the worker: how many per message, and how many
 *  messages may be unanswered at once. */
export function requestPlan(
  settings: Pick<Settings, 'decisionMode' | 'batchSize' | 'concurrency' | 'classifierConcurrency'>,
) {
  // Either way one message is one request's worth of posts; only the number
  // of requests allowed at once differs, since a classifier answers so quickly.
  return usesClassifier(settings)
    ? { batchSize: settings.batchSize, inFlight: settings.classifierConcurrency }
    : { batchSize: settings.batchSize, inFlight: settings.concurrency };
}

/** The classifier has a provider and key of its own, so the mode alone decides. */
export function usesClassifier(settings: Pick<Settings, 'decisionMode'>) {
  return settings.decisionMode === 'classifier';
}

/** Settings as stored by any earlier build, brought up to this one. Defaults
 *  fill fields added since. A reader who set up a chat model somewhere other
 *  than OpenRouter before the classifier existed keeps that model deciding,
 *  rather than waking up to a classifier they have no key for. */
export function upgrade(stored: Record<string, unknown>): Record<string, unknown> {
  const before =
    !('decisionMode' in stored) && typeof stored.provider === 'string'
      ? stored.provider !== 'openrouter'
      : false;
  return {
    ...defaults,
    ...stored,
    ...(before ? { decisionMode: 'llm' } : {}),
    // Never a reader's choice: it was saved along with everything else.
    ...(stored.visionModel === FORMER_VISION_MODEL ? { visionModel: DEFAULT_VISION_MODEL } : {}),
  };
}

/** What a classifier hide says in words; the banner shows the score instead. */
export const CLASSIFIER_REASON = 'Matches your filter';

type Lines = Pick<Settings, 'hideFrom' | 'closeCallMargin'>;
/** Hides under this are close calls. Never below the hide line, never over 100%. */
export function closeCallLine(settings: Lines): number {
  return Math.min(1, settings.hideFrom + settings.closeCallMargin);
}

/** A scored verdict is read against the reader's hide line as it stands now,
 *  whatever it was when the score was bought. Unscored verdicts pass through. */
export function readVerdict(settings: Lines, verdict: Verdict): Verdict {
  if (verdict.score === undefined || verdict.failed) return verdict;
  const hide = verdict.score >= settings.hideFrom;
  return { ...verdict, hide, reason: hide ? verdict.reason || CLASSIFIER_REASON : '' };
}

/** Whether a text-only score sends a post on to its images. The top of the
 *  range is open, except at 100%, which takes a certain hide too. */
export function imagesWanted(
  settings: Pick<Settings, 'imageCheckFrom' | 'imageCheckBelow'>,
  score: number,
): boolean {
  const { imageCheckFrom: from, imageCheckBelow: below } = settings;
  return score >= from && (score < below || (below >= 1 && from < 1));
}

export function publicSettings(settings: Settings): PublicSettings {
  const { apiKeys, ...rest } = settings;
  return {
    ...rest,
    configured: Boolean(
      (usesClassifier(settings)
        ? apiKeys[settings.classifierProvider]
        : apiKeys[settings.provider] && settings.model) && settings.criteria.trim(),
    ),
  };
}

/** Only inputs that change an AI decision invalidate paid verdicts. Corrections
 *  are deliberately left out: they steer future batches, and the corrected post
 *  itself is written straight into the cache, so nothing already paid for is
 *  thrown away each time the reader overrules one verdict. */
/** Bump when the system prompt changes in a way that should re-judge cached
 *  posts. Cached verdicts are keyed on this, so a bump re-buys the visible
 *  timeline once; leave it alone for wording that cannot change a verdict. */
export const PROMPT_VERSION = 3;

export function decisionScope(settings: PublicSettings | Settings): string {
  // The hide and close-call lines are not here: a classifier's probability is
  // cached and read against them at display time, so moving them re-buys nothing.
  if (usesClassifier(settings)) {
    return JSON.stringify([
      PROMPT_VERSION,
      'classifier',
      CLASSIFIER_MODEL,
      settings.criteria,
      settings.analyzeImages,
      settings.maxImagesPerPost,
      settings.analyzeImages ? settings.visionModel : '',
      settings.analyzeImages ? settings.imageCheckFrom : '',
      settings.analyzeImages ? settings.imageCheckBelow : '',
    ]);
  }
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
