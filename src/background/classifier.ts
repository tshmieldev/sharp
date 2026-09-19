// Decide with a classifier: a decision-only model reached through OpenRouter's
// Decisions endpoint. It answers typed questions with calibrated probabilities
// and never writes text, so it cannot read images or give a reason. Images are
// turned into text first by a fast vision model. The probability travels with
// the verdict; how sure counts as sure is the reader's call, made at display.
import { Effect, Schema } from 'effect';
import type { Post, Trace, Verdict } from '../common/post';
import {
  CLASSIFIER_REASON,
  classifierProviders,
  imagesWanted,
  readVerdict,
  visionProvider,
  type ClassifierProvider,
  type Settings,
} from '../common/settings';
import { ProviderError, requestJson } from './providers';

export { CLASSIFIER_REASON };
/** One gate for the whole worker, sized to the reader's setting: every post
 *  being judged holds a slot until its images and its decision are done, across
 *  every group and every tab. Each post is its own request, so one post's
 *  context can never leak into another's decision. A resize takes a fresh gate;
 *  posts already inside the old one finish there. */
let gate: { size: number; semaphore: Effect.Semaphore } | null = null;
function gateFor(size: number) {
  if (gate?.size !== size) gate = { size, semaphore: Effect.runSync(Effect.makeSemaphore(size)) };
  return gate.semaphore;
}
const DESCRIPTION_CACHE = 500;

// The same answer under two spellings: TypeSafe and OpenRouter say `noul` and
// snake_case usage, Vercel's gateway says `probability` and camelCase.
const Decision = Schema.Struct({
  answers: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      type: Schema.String,
      noul: Schema.optional(Schema.Number),
      probability: Schema.optional(Schema.Number),
    }),
  }),
  usage: Schema.optional(
    Schema.Struct({
      input_tokens: Schema.optional(Schema.Number),
      output_tokens: Schema.optional(Schema.Number),
      inputTokens: Schema.optional(Schema.Number),
      outputTokens: Schema.optional(Schema.Number),
    }),
  ),
});
const Description = Schema.Struct({
  choices: Schema.optional(
    Schema.Array(
      Schema.Struct({ message: Schema.Struct({ content: Schema.NullOr(Schema.String) }) }),
    ),
  ),
  usage: Schema.optional(Schema.Struct({ total_tokens: Schema.optional(Schema.Number) })),
});

/** The same image keeps coming back as a timeline scrolls; describe it once. */
const descriptions = new Map<string, string>();

export function decisionsUrl(settings: Pick<Settings, 'classifierProvider'>) {
  return classifierProviders[settings.classifierProvider].url;
}

/** Headers for one of the classifier's providers, under that provider's key.
 *  Vercel's gateway takes the model in a header and speaks a versioned protocol. */
function auth(settings: Settings, provider: ClassifierProvider, evaluation = false) {
  const base = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${settings.apiKeys[provider] ?? ''}`,
  };
  return provider === 'vercel' && evaluation
    ? {
        ...base,
        'ai-gateway-protocol-version': '0.0.1',
        'ai-gateway-auth-method': 'api-key',
        'ai-model-id': classifierProviders.vercel.model,
      }
    : base;
}

export function describeBody(settings: Settings, url: string) {
  return {
    model: settings.visionModel,
    max_tokens: 200,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe this image in one or two plain sentences, then transcribe every piece of text in it verbatim. No preamble, no markdown.',
          },
          { type: 'image_url', image_url: { url } },
        ],
      },
    ],
  };
}

/** A failed description costs the post its image, never its decision. */
function describe(settings: Settings, url: string) {
  const id = `${settings.visionModel}\n${url}`;
  const started = performance.now();
  const cached = descriptions.get(id);
  if (cached !== undefined) {
    return Effect.succeed({ text: cached, tokens: 0, cached: true, failed: false, ms: 0 });
  }
  const provider = visionProvider(settings);
  if (!provider) {
    return Effect.succeed({ text: '', tokens: 0, cached: false, failed: true, ms: 0 });
  }
  return requestJson(
    settings,
    classifierProviders[provider].chat,
    describeBody(settings, url),
    auth(settings, provider),
  ).pipe(
    Effect.flatMap(Schema.decodeUnknown(Description)),
    Effect.map((data) => {
      const text = data.choices?.[0]?.message.content?.trim().slice(0, 1500) ?? '';
      if (text) {
        if (descriptions.size >= DESCRIPTION_CACHE) {
          descriptions.delete(descriptions.keys().next().value!);
        }
        descriptions.set(id, text);
      }
      return {
        text,
        tokens: data.usage?.total_tokens ?? 0,
        cached: false,
        failed: !text,
        ms: performance.now() - started,
      };
    }),
    Effect.orElseSucceed(() => ({
      text: '',
      tokens: 0,
      cached: false,
      failed: true,
      ms: performance.now() - started,
    })),
  );
}

export function decisionBody(settings: Settings, post: Post, images: readonly string[]) {
  const provider = settings.classifierProvider;
  return {
    // Vercel's gateway names the model in a header and calls the type `boolean`.
    ...(provider === 'vercel' ? {} : { model: classifierProviders[provider].model }),
    state: {
      post: {
        author: `@${post.handle}`,
        text: post.text || '(no text)',
        ...(post.context ? { replying_to: post.context } : {}),
        ...(images.length ? { images } : {}),
      },
      ...(settings.corrections.length
        ? {
            reader_decisions_on_similar_posts: settings.corrections.map((entry) => ({
              author: `@${entry.handle}`,
              text: entry.text,
              reader_said: entry.hide ? 'hide' : 'keep',
            })),
          }
        : {}),
    },
    questions: {
      hide: {
        type: provider === 'vercel' ? 'boolean' : 'noul',
        instructions:
          `A reader filters their X timeline with this instruction, in their own words: ` +
          `"${settings.criteria}". Follow it literally: where it names what to hide, hide ` +
          `those posts; where it names what to keep, hide every post it does not cover. ` +
          `Judge a reply on its own merits, not on what it replies to. Where the reader ` +
          `decided similar posts themselves, judge the same way.`,
        criteria: {
          true: 'Hide this post: the instruction says the reader does not want it.',
          false: 'Show this post: the instruction does not rule it out.',
        },
      },
    },
  };
}

/** At or over the reader's hide line hides. The score travels with the verdict
 *  and is read again at display, against the lines as they stand by then. */
export function verdictFor(
  key: string,
  probability: number,
  lines: Pick<Settings, 'hideFrom' | 'closeCallMargin'> = { hideFrom: 0.5, closeCallMargin: 0.3 },
): Verdict {
  const score = Math.min(1, Math.max(0, probability));
  return readVerdict(lines, { key, hide: false, reason: '', score });
}

/** One question to the classifier: the probability, its cost, and what went
 *  over the wire. */
function decide(settings: Settings, post: Post, images: readonly string[]) {
  return Effect.gen(function* () {
    const body = decisionBody(settings, post, images);
    const started = performance.now();
    const raw = yield* requestJson(
      settings,
      decisionsUrl(settings),
      body,
      auth(settings, settings.classifierProvider, true),
    );
    const ms = performance.now() - started;
    const data = yield* Schema.decodeUnknown(Decision)(raw).pipe(
      Effect.mapError(
        () => new ProviderError({ message: 'The classifier returned an unexpected answer.' }),
      ),
    );
    const usage = data.usage;
    const tokens =
      (usage?.input_tokens ?? usage?.inputTokens ?? 0) +
      (usage?.output_tokens ?? usage?.outputTokens ?? 0);
    const probability = data.answers.hide?.noul ?? data.answers.hide?.probability;
    if (probability === undefined) {
      return yield* new ProviderError({ message: 'The classifier did not answer.', tokens });
    }
    return { probability, tokens, ms, body, raw };
  });
}

/** Text first; images only where the reader wants a second look. A post whose
 *  text-only score lands outside the reader's range stands on it and never pays
 *  for a description. One inside it is asked again with its images described,
 *  and that second answer is the verdict. A range covering every score skips
 *  the text-only pass, which could settle nothing. A post with no text has nothing to
 *  judge without its images, so it goes straight to them. */
function judge(settings: Settings, post: Post) {
  return Effect.gen(function* () {
    const started = performance.now();
    const wanted = settings.analyzeImages ? post.images : [];
    const always = settings.imageCheckFrom <= 0 && settings.imageCheckBelow >= 1;
    const textOnly =
      wanted.length > 0 && post.text.trim() && !always ? yield* decide(settings, post, []) : null;
    const needsImages =
      wanted.length > 0 && (!textOnly || imagesWanted(settings, textOnly.probability));
    const described = needsImages
      ? yield* Effect.forEach(wanted, (url) => describe(settings, url), {
          concurrency: 'unbounded',
        })
      : [];
    const seen = described.map((image) => image.text).filter(Boolean);
    // No description came back: asking again would only repeat the text's answer.
    const final = textOnly && seen.length === 0 ? textOnly : yield* decide(settings, post, seen);
    const tokens =
      final.tokens +
      (textOnly && textOnly !== final ? textOnly.tokens : 0) +
      described.reduce((sum, image) => sum + image.tokens, 0);
    const verdict = verdictFor(post.key, final.probability, settings);
    if (!settings.debug) return { verdict, tokens };
    const trace: Trace = {
      source: 'classifier',
      model: classifierProviders[settings.classifierProvider].model,
      at: Date.now(),
      totalMs: performance.now() - started,
      requestMs: final.ms,
      tokens,
      images: wanted.map((url, index) => {
        const image = described[index];
        if (!image) return { url, skipped: true };
        return {
          url,
          model: settings.visionModel,
          description: image.text,
          ms: image.ms,
          cached: image.cached,
          ...(image.failed ? { failed: true } : {}),
        };
      }),
      ...(textOnly && textOnly !== final
        ? {
            textPass: {
              score: textOnly.probability,
              ms: textOnly.ms,
              request: textOnly.body,
              response: textOnly.raw,
            },
          }
        : {}),
      request: final.body,
      response: final.raw,
    };
    return { verdict: { ...verdict, trace }, tokens };
  });
}

export function classifyWithClassifier(settings: Settings, items: readonly Post[]) {
  return Effect.gen(function* () {
    if (!settings.apiKeys[settings.classifierProvider] || !settings.criteria.trim()) {
      return yield* new ProviderError({
        message: `Set a ${classifierProviders[settings.classifierProvider].label} key and filter criteria first.`,
      });
    }
    const semaphore = gateFor(settings.classifierConcurrency);
    const results = yield* Effect.forEach(
      items,
      (post) => Effect.either(semaphore.withPermits(1)(judge(settings, post))),
      { concurrency: 'unbounded' },
    );
    const tokens = results.reduce(
      (sum, result) =>
        sum + (result._tag === 'Right' ? result.right.tokens : (result.left.tokens ?? 0)),
      0,
    );
    // One bad post is retried later; every post failing is a real problem.
    const failures = results.filter((result) => result._tag === 'Left');
    if (failures.length === results.length && failures[0]?._tag === 'Left') {
      const error = failures[0].left;
      return yield* new ProviderError({
        message: error instanceof ProviderError ? error.message : 'Classifier request failed.',
        tokens,
      });
    }
    const verdicts: Verdict[] = results.map((result, index) =>
      result._tag === 'Right'
        ? result.right.verdict
        : { key: items[index]!.key, hide: false, reason: '', failed: true },
    );
    return { verdicts, tokens };
  });
}
