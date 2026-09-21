// Decide with a classifier: a decision-only model that answers typed questions
// with calibrated probabilities and never writes text, so it cannot read images
// or give a reason. It answers every question in a request in parallel, so
// posts go to it in groups: about one round trip and half the tokens of asking
// one by one. Images are turned into text first by a fast vision model. The
// probability travels with the verdict; how sure counts as sure is the reader's
// call, made at display.
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
/** One gate for the whole worker, sized to the reader's setting: every group
 *  being judged holds a slot until its images and its decisions are done,
 *  across every tab. A resize takes a fresh gate; groups already inside the old
 *  one finish there. */
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

type Entry = { post: Post; images: readonly string[] };
/** A lone post answers to `hide`; a group is keyed p1..pN, one question each. */
const idOf = (index: number, alone: boolean) => (alone ? 'hide' : `p${index + 1}`);

/** One request for one post or for several. The classifier answers every
 *  question in a request in parallel, so a group costs about one round trip and
 *  far fewer tokens than the same posts asked one by one. Each question names
 *  its own post, so the others are context and never the subject. */
export function decisionBody(settings: Settings, entries: readonly Entry[]) {
  const provider = settings.classifierProvider;
  const alone = entries.length === 1;
  const shape = ({ post, images }: Entry) => ({
    author: `@${post.handle}`,
    text: post.text || '(no text)',
    ...(post.context ? { replying_to: post.context } : {}),
    ...(images.length ? { images } : {}),
  });
  const question = (id: string) => ({
    // Vercel's gateway calls the type `boolean`.
    type: provider === 'vercel' ? 'boolean' : 'noul',
    instructions:
      `A reader filters their X timeline with this instruction, in their own words: ` +
      `"${settings.criteria}". Follow it literally: where it names what to hide, hide ` +
      `those posts; where it names what to keep, hide every post it does not cover. ` +
      `Judge a reply on its own merits, not on what it replies to. Where the reader ` +
      `decided similar posts themselves, judge the same way.` +
      (alone
        ? ''
        : ` Judge only the post with id "${id}", on its own merits, whatever the other posts say.`),
    criteria: {
      true: 'Hide this post: the instruction says the reader does not want it.',
      false: 'Show this post: the instruction does not rule it out.',
    },
  });
  return {
    // Vercel's gateway names the model in a header.
    ...(provider === 'vercel' ? {} : { model: classifierProviders[provider].model }),
    state: {
      ...(alone
        ? { post: shape(entries[0]!) }
        : { posts: Object.fromEntries(entries.map((entry, i) => [idOf(i, false), shape(entry)])) }),
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
    questions: Object.fromEntries(
      entries.map((_, i) => [idOf(i, alone), question(idOf(i, alone))]),
    ),
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

/** One request: a probability per post (none where the classifier skipped
 *  one), what it cost, and what went over the wire. */
function decide(settings: Settings, entries: readonly Entry[]) {
  return Effect.gen(function* () {
    const body = decisionBody(settings, entries);
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
    const alone = entries.length === 1;
    const probabilities = entries.map((_, i) => {
      const answer = data.answers[idOf(i, alone)];
      return answer?.noul ?? answer?.probability;
    });
    return { probabilities, tokens, ms, body, raw, size: entries.length };
  });
}
type Pass = Effect.Effect.Success<ReturnType<typeof decide>>;
type Answer = { probability: number; pass: Pass };

/** A group of posts, judged together. Text first; images only where the reader
 *  wants a second look. A post whose text-only score lands outside the reader's
 *  range stands on it and never pays for a description. The ones inside it have
 *  their images described and are asked again, together, and that second answer
 *  is the verdict. A range covering every score skips the text-only pass, which
 *  could settle nothing, and a post with no text has nothing to judge without
 *  its images, so both go straight to the second request. */
function judge(settings: Settings, posts: readonly Post[]) {
  return Effect.gen(function* () {
    const started = performance.now();
    const always = settings.imageCheckFrom <= 0 && settings.imageCheckBelow >= 1;
    const wanted = posts.map((post) => (settings.analyzeImages ? post.images : []));
    const textFirst = posts.map(
      (post, i) => wanted[i]!.length === 0 || (Boolean(post.text.trim()) && !always),
    );
    let tokens = 0;
    let failure: ProviderError | undefined;
    const ask = (indexes: readonly number[], images: (i: number) => readonly string[]) =>
      Effect.gen(function* () {
        const answers = new Map<number, Answer>();
        if (!indexes.length) return answers;
        const result = yield* Effect.either(
          decide(
            settings,
            indexes.map((i) => ({ post: posts[i]!, images: images(i) })),
          ),
        );
        if (result._tag === 'Left') {
          failure ??=
            result.left instanceof ProviderError
              ? result.left
              : new ProviderError({ message: 'Classifier request failed.' });
          return answers;
        }
        tokens += result.right.tokens;
        indexes.forEach((i, at) => {
          const probability = result.right.probabilities[at];
          if (probability !== undefined) answers.set(i, { probability, pass: result.right });
        });
        return answers;
      });

    const first = yield* ask(
      posts.flatMap((_, i) => (textFirst[i] ? [i] : [])),
      () => [],
    );
    const looking = posts.flatMap((_, i) => {
      if (!wanted[i]!.length) return [];
      const text = first.get(i);
      // A failed text-only request is not a reason to pay for images too.
      if (textFirst[i]) return text && imagesWanted(settings, text.probability) ? [i] : [];
      return [i];
    });
    const described = new Map(
      yield* Effect.forEach(
        looking,
        (i) =>
          Effect.forEach(wanted[i]!, (url) => describe(settings, url), {
            concurrency: 'unbounded',
          }).pipe(Effect.map((images) => [i, images] as const)),
        { concurrency: 'unbounded' },
      ),
    );
    for (const images of described.values()) {
      tokens += images.reduce((sum, image) => sum + image.tokens, 0);
    }
    const seen = (i: number) => (described.get(i) ?? []).map((image) => image.text).filter(Boolean);
    // No description came back: asking again would only repeat the text's answer.
    const second = yield* ask(
      looking.filter((i) => !first.has(i) || seen(i).length > 0),
      seen,
    );

    const totalMs = performance.now() - started;
    const verdicts = posts.map((post, i): Verdict => {
      const final = second.get(i) ?? first.get(i);
      if (!final) return { key: post.key, hide: false, reason: '', failed: true };
      const verdict = verdictFor(post.key, final.probability, settings);
      if (!settings.debug) return verdict;
      const text = second.has(i) ? first.get(i) : undefined;
      const trace: Trace = {
        source: 'classifier',
        model: classifierProviders[settings.classifierProvider].model,
        at: Date.now(),
        totalMs,
        requestMs: final.pass.ms,
        batch: final.pass.size,
        // What this post's requests cost. A group's request is shared, so its
        // whole cost shows on every post that was in it.
        tokens:
          final.pass.tokens +
          (text?.pass.tokens ?? 0) +
          (described.get(i) ?? []).reduce((sum, image) => sum + image.tokens, 0),
        images: wanted[i]!.map((url, at) => {
          const image = described.get(i)?.[at];
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
        ...(text
          ? {
              textPass: {
                score: text.probability,
                ms: text.pass.ms,
                request: text.pass.body,
                response: text.pass.raw,
              },
            }
          : {}),
        request: final.pass.body,
        response: final.pass.raw,
      };
      return { ...verdict, trace };
    });
    return { verdicts, tokens, failure };
  });
}

export function classifyWithClassifier(settings: Settings, items: readonly Post[]) {
  return Effect.gen(function* () {
    if (!settings.apiKeys[settings.classifierProvider] || !settings.criteria.trim()) {
      return yield* new ProviderError({
        message: `Set a ${classifierProviders[settings.classifierProvider].label} key and filter criteria first.`,
      });
    }
    // The page already sends groups of this size; a larger call is split here.
    const groups: Post[][] = [];
    for (let i = 0; i < items.length; i += settings.batchSize) {
      groups.push(items.slice(i, i + settings.batchSize));
    }
    const semaphore = gateFor(settings.classifierConcurrency);
    const results = yield* Effect.forEach(
      groups,
      (group) => semaphore.withPermits(1)(judge(settings, group)),
      { concurrency: 'unbounded' },
    );
    const verdicts = results.flatMap((result) => result.verdicts);
    const tokens = results.reduce((sum, result) => sum + result.tokens, 0);
    // A few bad posts are retried later; every post failing is a real problem.
    if (verdicts.length && verdicts.every((verdict) => verdict.failed)) {
      const failure = results.find((result) => result.failure)?.failure;
      return yield* new ProviderError({
        message: failure?.message ?? 'The classifier did not answer.',
        tokens,
      });
    }
    return { verdicts, tokens };
  });
}
