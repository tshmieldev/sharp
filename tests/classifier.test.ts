import { Effect, Schema } from 'effect';
import { afterEach, expect, it, vi } from 'vitest';
import { CLASSIFIER_REASON, decisionsUrl, verdictFor } from '../src/background/classifier';
import { classify } from '../src/background/providers';
import {
  apiOrigins,
  CLASSIFIER_MODEL,
  closeCallLine,
  decisionScope,
  defaults,
  readVerdict,
  publicSettings,
  requestPlan,
  Settings,
  upgrade,
  usesClassifier,
  visionProvider,
} from '../src/common/settings';

// One post per request here; the tests at the bottom cover groups.
const settings = { ...defaults, batchSize: 1, apiKeys: { openrouter: 'test-key' } };
const post = (key: string, images: string[] = [], text = `post ${key}`) => ({
  key,
  handle: 'alice',
  text,
  images,
  context: '',
});
afterEach(() => vi.unstubAllGlobals());
/** Unsure from the text, sure once the images are described. */
const closeUntilSeen = (body: { state: { post: { images?: string[] } } }) =>
  body.state.post.images ? 0.95 : 0.6;

/** OpenRouter as the classifier sees it: decisions on one path, images on another. */
function stubOpenRouter(
  noul: (body: { state: { post: { text: string; images?: string[] } } }) => number,
) {
  const calls: { url: string; body: any }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url, body });
      if (url.endsWith('/api/alpha/decisions') || url.endsWith('/v1/systemone')) {
        // A group is keyed p1..pN; each post is scored as if it were alone.
        const group: Record<string, { text: string; images?: string[] }> | undefined =
          body.state.posts;
        const answers = group
          ? Object.fromEntries(
              Object.entries(group).map(([id, entry]) => [
                id,
                { type: 'noul', noul: noul({ state: { post: entry } }) },
              ]),
            )
          : { hide: { type: 'noul', noul: noul(body) } };
        return Response.json({
          model: CLASSIFIER_MODEL,
          answers,
          usage: { input_tokens: 40, output_tokens: 1 },
        });
      }
      return Response.json({
        choices: [{ message: { content: 'A screenshot. Text: "BUY NOW"' } }],
        usage: { total_tokens: 30 },
      });
    }),
  );
  return calls;
}

it('is the default, with a provider and key of its own', () => {
  expect(defaults.decisionMode).toBe('classifier');
  expect(defaults.classifierProvider).toBe('openrouter');
  expect(usesClassifier(defaults)).toBe(true);
  expect(usesClassifier({ ...defaults, decisionMode: 'llm' })).toBe(false);
  // Ready with the classifier's key alone: no chat model, no chat provider's key.
  expect(publicSettings({ ...settings, model: '', provider: 'anthropic' }).configured).toBe(true);
  expect(publicSettings({ ...settings, classifierProvider: 'vercel' }).configured).toBe(false);
  expect(
    publicSettings({ ...defaults, classifierProvider: 'vercel', apiKeys: { vercel: 'k' } })
      .configured,
  ).toBe(true);
});

it('keeps a chat model deciding for a reader who set one up before the classifier', () => {
  expect(upgrade({ provider: 'openai', model: 'gpt' })).toMatchObject({ decisionMode: 'llm' });
  expect(upgrade({ provider: 'openrouter' })).toMatchObject({ decisionMode: 'classifier' });
  expect(upgrade({})).toMatchObject({ decisionMode: 'classifier' });
  // The image model moves to the new default unless the reader chose their own.
  expect(upgrade({ visionModel: 'google/gemini-2.5-flash-lite' }).visionModel).toBe(
    'google/gemma-4-26b-a4b-it',
  );
  expect(upgrade({ visionModel: 'my/model' }).visionModel).toBe('my/model');
  expect(defaults.visionModel).toBe('google/gemma-4-26b-a4b-it');
  // Once the mode has been saved, it is the reader's and is left alone.
  expect(upgrade({ provider: 'openai', decisionMode: 'classifier' })).toMatchObject({
    decisionMode: 'classifier',
  });
});

it('hides over even odds and carries the probability, never a model name', () => {
  expect(verdictFor('1', 0.93)).toEqual({
    key: '1',
    hide: true,
    reason: CLASSIFIER_REASON,
    score: 0.93,
  });
  expect(verdictFor('1', 0.3)).toEqual({ key: '1', hide: false, reason: '', score: 0.3 });
  expect(CLASSIFIER_REASON).not.toMatch(/jev|typesafe/i);
});

it('calls the Decisions endpoint beside /api/v1, with the OpenRouter key', async () => {
  expect(decisionsUrl(settings)).toBe('https://openrouter.ai/api/alpha/decisions');
  const calls = stubOpenRouter(() => 0.9);
  const result = await Effect.runPromise(classify(settings, [post('1'), post('2')]));
  expect(result.verdicts.map((verdict) => verdict.hide)).toEqual([true, true]);
  expect(calls).toHaveLength(2);
  expect(calls[0]!.body).toMatchObject({
    model: CLASSIFIER_MODEL,
    state: { post: { author: '@alice', text: 'post 1' } },
    questions: { hide: { type: 'noul' } },
  });
  expect(calls[0]!.body.questions.hide.instructions).toContain(defaults.criteria);
  const init = vi.mocked(fetch).mock.calls[0]![1]!;
  expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });
  expect(result.tokens).toBe(82);
});

it('asks each post separately, so no post is judged on another', async () => {
  stubOpenRouter((body) => (body.state.post.text === 'post 2' ? 0.95 : 0.1));
  const result = await Effect.runPromise(classify(settings, [post('1'), post('2')]));
  expect(result.verdicts.map((verdict) => verdict.hide)).toEqual([false, true]);
});

it('describes images with the chosen image model only when photos are on, once each', async () => {
  const image = 'https://pbs.twimg.com/media/classifier-cache-test.jpg';
  const visionModel = 'test/vision-model';
  let calls = stubOpenRouter(closeUntilSeen);
  await Effect.runPromise(classify({ ...settings, visionModel }, [post('1', [image])]));
  expect(calls.some((call) => call.body.model === visionModel)).toBe(false);

  calls = stubOpenRouter(closeUntilSeen);
  const withPhotos = { ...settings, analyzeImages: true, visionModel };
  await Effect.runPromise(classify(withPhotos, [post('1', [image])]));
  const described = calls.filter((call) => call.body.model === visionModel);
  expect(described).toHaveLength(1);
  expect(described[0]!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
  const decision = calls.filter((call) => call.body.model === CLASSIFIER_MODEL).at(-1)!;
  expect(decision.body.state.post.images).toEqual(['A screenshot. Text: "BUY NOW"']);

  calls = stubOpenRouter(closeUntilSeen);
  await Effect.runPromise(classify(withPhotos, [post('2', [image])]));
  expect(calls.filter((call) => call.body.model === visionModel)).toHaveLength(0);
  // A different image model is a different description.
  calls = stubOpenRouter(closeUntilSeen);
  await Effect.runPromise(
    classify({ ...withPhotos, visionModel: 'test/other' }, [post('3', [image])]),
  );
  expect(calls.filter((call) => call.body.model === 'test/other')).toHaveLength(1);
});

it('still decides a post whose image could not be described', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/chat/completions')
        ? new Response('nope', { status: 500 })
        : Response.json({ answers: { hide: { type: 'noul', noul: 0.2 } } }),
    ),
  );
  const result = await Effect.runPromise(
    classify({ ...settings, analyzeImages: true }, [
      post('1', ['https://pbs.twimg.com/media/broken.jpg']),
    ]),
  );
  expect(result.verdicts[0]).toMatchObject({ key: '1', hide: false, score: 0.2 });
});

it('retries a single failed post later, and surfaces a failure of every post', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) =>
      JSON.parse(String(init.body)).state.post.text === 'post 2'
        ? new Response('', { status: 500 })
        : Response.json({ answers: { hide: { type: 'noul', noul: 0.9 } } }),
    ),
  );
  const result = await Effect.runPromise(classify(settings, [post('1'), post('2')]));
  expect(result.verdicts[1]).toEqual({ key: '2', hide: false, reason: '', failed: true });

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 401 })),
  );
  await expect(Effect.runPromise(classify(settings, [post('1')]))).rejects.toThrow(
    'Check your API key',
  );
});

it('reaches the classifier through Vercel’s gateway, in its dialect', async () => {
  const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url,
        headers: init.headers as Record<string, string>,
        body: JSON.parse(String(init.body)),
      });
      return url.endsWith('/evaluation-model')
        ? Response.json({
            answers: { hide: { type: 'boolean', probability: 0.9 } },
            usage: { inputTokens: 50, outputTokens: 2 },
          })
        : Response.json({ choices: [{ message: { content: 'A chart.' } }] });
    }),
  );
  const vercel = {
    ...defaults,
    classifierProvider: 'vercel' as const,
    analyzeImages: true,
    imageCheckFrom: 0,
    imageCheckBelow: 1,
    apiKeys: { vercel: 'vck_test', openrouter: 'other' },
  };
  const result = await Effect.runPromise(
    classify(vercel, [post('v1', ['https://pbs.twimg.com/media/vercel-test.jpg'])]),
  );
  expect(result.verdicts[0]).toMatchObject({ hide: true, score: 0.9 });
  expect(result.tokens).toBe(52);
  const decision = calls.find((call) => call.url.endsWith('/evaluation-model'))!;
  expect(decision.url).toBe('https://ai-gateway.vercel.sh/v4/ai/evaluation-model');
  expect(decision.headers).toMatchObject({
    Authorization: 'Bearer vck_test',
    'ai-model-id': 'typesafe-ai/jev',
    'ai-gateway-auth-method': 'api-key',
  });
  expect(decision.body.model).toBeUndefined();
  expect(decision.body.questions.hide.type).toBe('boolean');
  // Images are described through the same gateway, under the same key.
  const vision = calls.find((call) => call.url.endsWith('/chat/completions'))!;
  expect(vision.url).toBe('https://ai-gateway.vercel.sh/v1/chat/completions');
  expect(vision.headers.Authorization).toBe('Bearer vck_test');
  expect(vision.headers['ai-model-id']).toBeUndefined();
});

it('reaches TypeSafe directly, and borrows another key for images', async () => {
  const calls = stubOpenRouter(() => 0.9);
  const typesafe = {
    ...defaults,
    classifierProvider: 'typesafe' as const,
    apiKeys: { typesafe: 'sk-ts' },
  };
  await Effect.runPromise(classify(typesafe, [post('t1')]));
  expect(calls[0]!.url).toBe('https://api.typesafe.ai/v1/systemone');
  expect(calls[0]!.body).toMatchObject({
    model: 'jev-latest',
    questions: { hide: { type: 'noul' } },
  });
  expect(vi.mocked(fetch).mock.calls[0]![1]!.headers).toMatchObject({
    Authorization: 'Bearer sk-ts',
  });
  expect(visionProvider(typesafe)).toBeNull();
  expect(visionProvider({ ...typesafe, apiKeys: { typesafe: 'a', vercel: 'b' } })).toBe('vercel');
  expect(visionProvider({ ...typesafe, apiKeys: { openrouter: 'a', vercel: 'b' } })).toBe(
    'openrouter',
  );
  expect(visionProvider(defaults)).toBe('openrouter');
});

it('asks permission for every origin the settings will call, and no more', () => {
  expect(apiOrigins(defaults)).toEqual(['https://openrouter.ai/*']);
  expect(apiOrigins({ ...defaults, classifierProvider: 'vercel' })).toEqual([
    'https://ai-gateway.vercel.sh/*',
  ]);
  const typesafe = { ...defaults, classifierProvider: 'typesafe' as const, analyzeImages: true };
  expect(apiOrigins(typesafe)).toEqual(['https://api.typesafe.ai/*']);
  expect(apiOrigins({ ...typesafe, apiKeys: { vercel: 'k' } })).toEqual([
    'https://api.typesafe.ai/*',
    'https://ai-gateway.vercel.sh/*',
  ]);
  // A chat model calls only its own provider.
  expect(apiOrigins({ ...defaults, decisionMode: 'llm', provider: 'anthropic' })).toEqual([
    'https://api.anthropic.com/*',
  ]);
});

it('keeps verdict caches apart per mode, and moving either line re-buys nothing', () => {
  expect(decisionScope(settings)).not.toBe(decisionScope({ ...settings, decisionMode: 'llm' }));
  expect(decisionScope(settings)).toBe(
    decisionScope({ ...settings, hideFrom: 0.2, closeCallMargin: 0.6 }),
  );
  // The chat model is irrelevant to a classifier's verdicts.
  expect(decisionScope(settings)).toBe(decisionScope({ ...settings, model: 'other/model' }));
});

it('records everything behind a decision in debug mode, and nothing otherwise', async () => {
  const image = 'https://pbs.twimg.com/media/debug-trace-test.jpg';
  stubOpenRouter(closeUntilSeen);
  const plain = await Effect.runPromise(
    classify({ ...settings, analyzeImages: true }, [post('1', [image])]),
  );
  expect(plain.verdicts[0]!.trace).toBeUndefined();

  stubOpenRouter(closeUntilSeen);
  const debugged = await Effect.runPromise(
    classify({ ...settings, analyzeImages: true, debug: true }, [
      post('2', ['https://pbs.twimg.com/media/debug-trace-fresh.jpg']),
    ]),
  );
  const trace = debugged.verdicts[0]!.trace!;
  expect(trace).toMatchObject({
    source: 'classifier',
    model: CLASSIFIER_MODEL,
    tokens: 112,
    request: { model: CLASSIFIER_MODEL, state: { post: { text: 'post 2' } } },
    response: { answers: { hide: { noul: 0.95 } } },
    textPass: { score: 0.6, response: { answers: { hide: { noul: 0.6 } } } },
  });
  expect(trace.totalMs).toBeGreaterThanOrEqual(trace.requestMs!);
  expect(trace.images).toEqual([
    expect.objectContaining({
      url: 'https://pbs.twimg.com/media/debug-trace-fresh.jpg',
      model: defaults.visionModel,
      description: 'A screenshot. Text: "BUY NOW"',
      cached: false,
    }),
  ]);
  // The key is in a header, never in what the trace keeps.
  expect(JSON.stringify(trace)).not.toContain('test-key');
});

it('never judges more posts at once than the reader allows', async () => {
  const peak = async (classifierConcurrency: number) => {
    let open = 0;
    let most = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        most = Math.max(most, ++open);
        await new Promise((resolve) => setTimeout(resolve, 5));
        open--;
        return Response.json({ answers: { hide: { type: 'noul', noul: 0.1 } } });
      }),
    );
    const posts = Array.from({ length: 12 }, (_, index) => post(`peak-${index}`));
    await Effect.runPromise(classify({ ...settings, classifierConcurrency }, posts));
    return most;
  };
  expect(await peak(3)).toBe(3);
  expect(await peak(12)).toBe(12);
});

it('hands the worker one request’s worth of posts per message, in either mode', () => {
  expect(requestPlan({ ...settings, batchSize: 12, classifierConcurrency: 16 })).toEqual({
    batchSize: 12,
    inFlight: 16,
  });
  expect(requestPlan({ ...settings, batchSize: 1, classifierConcurrency: 64 })).toEqual({
    batchSize: 1,
    inFlight: 64,
  });
  expect(requestPlan({ ...settings, decisionMode: 'llm', batchSize: 12, concurrency: 12 })).toEqual(
    { batchSize: 12, inFlight: 12 },
  );
});

it('allows up to 64 classifier requests and 12 language-model requests at once', () => {
  const decode = Schema.decodeUnknownSync(Settings);
  expect(decode({ ...defaults, classifierConcurrency: 64, concurrency: 12 })).toMatchObject({
    classifierConcurrency: 64,
    concurrency: 12,
  });
  expect(() => decode({ ...defaults, classifierConcurrency: 65 })).toThrow();
  expect(() => decode({ ...defaults, concurrency: 13 })).toThrow();
});

it('describes images only for a post scored inside the range, or one with no text', async () => {
  const on = { ...settings, analyzeImages: true, visionModel: 'test/cascade' };
  const run = async (score: number, overrides = {}, text?: string) => {
    const calls = stubOpenRouter((body) => (body.state.post.images ? 0.95 : score));
    // A fresh image each run, so none is already described.
    const id = Math.random();
    const image = `https://pbs.twimg.com/media/cascade-${id}.jpg`;
    const result = await Effect.runPromise(
      classify({ ...on, ...overrides }, [post(`c-${id}`, [image], text)]),
    );
    return {
      described: calls.some((call) => call.body.model === 'test/cascade'),
      decisions: calls.filter((call) => call.body.model === CLASSIFIER_MODEL).length,
      score: result.verdicts[0]!.score,
    };
  };
  // Outside the range, 50–80% by default, the text stands.
  expect(await run(0.2)).toEqual({ described: false, decisions: 1, score: 0.2 });
  expect(await run(0.85)).toEqual({ described: false, decisions: 1, score: 0.85 });
  expect(await run(0.8)).toMatchObject({ decisions: 1 });
  // Inside it the post is asked again, and that answer is the verdict.
  expect(await run(0.6)).toEqual({ described: true, decisions: 2, score: 0.95 });
  expect(await run(0.5)).toMatchObject({ decisions: 2 });
  // The range is the reader's, from anywhere to anywhere.
  const low = { imageCheckFrom: 0, imageCheckBelow: 0.3 };
  expect(await run(0.2, low)).toMatchObject({ described: true, decisions: 2 });
  expect(await run(0.6, low)).toMatchObject({ described: false, decisions: 1 });
  // Up to 100% takes a certain hide too; an empty range takes nothing.
  expect(await run(1, { imageCheckFrom: 0.9, imageCheckBelow: 1 })).toMatchObject({ decisions: 2 });
  expect(await run(0.6, { imageCheckFrom: 0.6, imageCheckBelow: 0.6 })).toMatchObject({
    described: false,
    decisions: 1,
  });
  // Every score: the text-only pass could settle nothing, so it is skipped.
  expect(await run(0.6, { imageCheckFrom: 0, imageCheckBelow: 1 })).toEqual({
    described: true,
    decisions: 1,
    score: 0.95,
  });
  // Nothing to read, so the images are all there is.
  expect(await run(0.1, {}, '')).toEqual({ described: true, decisions: 1, score: 0.95 });
});

it('keeps the text answer when no image could be described', async () => {
  let decisions = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/chat/completions')) return new Response('nope', { status: 500 });
      decisions++;
      return Response.json({ answers: { hide: { type: 'noul', noul: 0.6 } } });
    }),
  );
  const result = await Effect.runPromise(
    classify({ ...settings, analyzeImages: true }, [
      post('1', ['https://pbs.twimg.com/media/cascade-broken.jpg']),
    ]),
  );
  expect(decisions).toBe(1);
  expect(result.verdicts[0]).toMatchObject({ hide: true, score: 0.6 });
});

it('re-buys verdicts when the image range moves, but only while images are on', () => {
  const on = { ...settings, analyzeImages: true };
  expect(decisionScope(on)).not.toBe(decisionScope({ ...on, imageCheckBelow: 0.9 }));
  expect(decisionScope(on)).not.toBe(decisionScope({ ...on, imageCheckFrom: 0.1 }));
  expect(decisionScope(settings)).toBe(decisionScope({ ...settings, imageCheckBelow: 0.9 }));
});

it('hides from the reader’s own line, and reads an old score against a new one', () => {
  expect(verdictFor('1', 0.3, { hideFrom: 0.2, closeCallMargin: 0.1 })).toMatchObject({
    hide: true,
    reason: CLASSIFIER_REASON,
  });
  expect(verdictFor('1', 0.7, { hideFrom: 0.9, closeCallMargin: 0 }).hide).toBe(false);
  // A keep bought at 50% becomes a hide when the line drops under it, and back.
  const kept = verdictFor('1', 0.3);
  const hidden = readVerdict({ hideFrom: 0.25, closeCallMargin: 0.3 }, kept);
  expect(hidden).toMatchObject({ hide: true, reason: CLASSIFIER_REASON, score: 0.3 });
  expect(readVerdict(defaults, hidden)).toEqual(kept);
  // A verdict with no score, a chat model's or a correction, is left alone.
  const correction = { key: '2', hide: true, reason: 'Your correction' };
  expect(readVerdict({ hideFrom: 1, closeCallMargin: 0 }, correction)).toBe(correction);
});

it('draws the close-call line a margin over the hide line, never past 100%', () => {
  expect(closeCallLine(defaults)).toBeCloseTo(0.8);
  expect(closeCallLine({ hideFrom: 0.9, closeCallMargin: 0.3 })).toBe(1);
  expect(closeCallLine({ hideFrom: 0, closeCallMargin: 0 })).toBe(0);
  const decode = Schema.decodeUnknownSync(Settings);
  expect(decode({ ...defaults, hideFrom: 0, imageCheckFrom: 0 })).toMatchObject({
    hideFrom: 0,
    imageCheckFrom: 0,
  });
});

it('judges a group in one request, each question naming its own post', async () => {
  const calls = stubOpenRouter((body) => (body.state.post.text.includes('shill') ? 0.96 : 0.04));
  const group = { ...settings, batchSize: 8 };
  const posts = [post('a'), post('b', [], 'pure shill'), post('c')];
  const result = await Effect.runPromise(classify(group, posts));
  expect(calls).toHaveLength(1);
  const body = calls[0]!.body;
  expect(Object.keys(body.state.posts)).toEqual(['p1', 'p2', 'p3']);
  expect(body.state.post).toBeUndefined();
  expect(body.state.posts.p2).toMatchObject({ author: '@alice', text: 'pure shill' });
  expect(Object.keys(body.questions)).toEqual(['p1', 'p2', 'p3']);
  expect(body.questions.p2.instructions).toContain('Judge only the post with id "p2"');
  expect(body.questions.p2.instructions).toContain(defaults.criteria);
  // Answers come back to the posts they belong to, in order.
  expect(result.verdicts.map((verdict) => [verdict.key, verdict.hide, verdict.score])).toEqual([
    ['a', false, 0.04],
    ['b', true, 0.96],
    ['c', false, 0.04],
  ]);
  // A lone post keeps the single shape, whatever the batch size.
  const alone = stubOpenRouter(() => 0.9);
  await Effect.runPromise(classify(group, [post('d')]));
  expect(alone[0]!.body.state.post).toMatchObject({ text: 'post d' });
  expect(Object.keys(alone[0]!.body.questions)).toEqual(['hide']);
});

it('splits a call larger than the batch size, and gates requests, not posts', async () => {
  let open = 0;
  let most = 0;
  let requests = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      requests++;
      most = Math.max(most, ++open);
      await new Promise((resolve) => setTimeout(resolve, 5));
      open--;
      const ids = Object.keys(JSON.parse(String(init.body)).questions);
      return Response.json({
        answers: Object.fromEntries(ids.map((id) => [id, { type: 'noul', noul: 0.1 }])),
      });
    }),
  );
  const posts = Array.from({ length: 12 }, (_, index) => post(`split-${index}`));
  const result = await Effect.runPromise(
    classify({ ...settings, batchSize: 4, classifierConcurrency: 2 }, posts),
  );
  expect(requests).toBe(3);
  expect(most).toBe(2);
  expect(result.verdicts).toHaveLength(12);
  expect(result.verdicts.every((verdict) => verdict.score === 0.1)).toBe(true);
});

it('looks at images for the whole group in one second request, only where wanted', async () => {
  const calls = stubOpenRouter((body) =>
    body.state.post.images ? 0.95 : body.state.post.text === 'unsure' ? 0.6 : 0.1,
  );
  const on = { ...settings, batchSize: 8, analyzeImages: true, visionModel: 'test/group' };
  const image = (name: string) => [
    `https://pbs.twimg.com/media/group-${name}-${Math.random()}.jpg`,
  ];
  const result = await Effect.runPromise(
    classify(on, [
      post('fine', image('a'), 'fine'),
      post('unsure', image('b'), 'unsure'),
      post('plain', [], 'plain'),
      post('textless', image('c'), ''),
    ]),
  );
  const decisions = calls.filter((call) => !call.url.endsWith('/chat/completions'));
  // Text first, for the posts that have text.
  expect(Object.values<any>(decisions[0]!.body.state.posts).map((entry) => entry.text)).toEqual([
    'fine',
    'unsure',
    'plain',
  ]);
  expect(JSON.stringify(decisions[0]!.body)).not.toContain('"images"');
  // Then one more request, for the in-range post and the one with no text.
  expect(decisions).toHaveLength(2);
  const second = Object.values<any>(decisions[1]!.body.state.posts);
  expect(second.map((entry) => entry.text)).toEqual(['unsure', '(no text)']);
  expect(second.every((entry) => entry.images?.length === 1)).toBe(true);
  expect(calls.filter((call) => call.body.model === 'test/group')).toHaveLength(2);
  expect(result.verdicts.map((verdict) => verdict.score)).toEqual([0.1, 0.95, 0.1, 0.95]);
});

it('fails only the post the classifier skipped, and surfaces a group that failed whole', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ answers: { p1: { type: 'noul', noul: 0.9 } } })),
  );
  const group = { ...settings, batchSize: 8 };
  const result = await Effect.runPromise(classify(group, [post('1'), post('2')]));
  expect(result.verdicts[0]).toMatchObject({ key: '1', hide: true, score: 0.9 });
  expect(result.verdicts[1]).toEqual({ key: '2', hide: false, reason: '', failed: true });

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 429 })),
  );
  await expect(Effect.runPromise(classify(group, [post('1'), post('2')]))).rejects.toThrow(
    'Rate limited',
  );
});

it('says in the trace how many posts shared the request', async () => {
  stubOpenRouter(() => 0.9);
  const result = await Effect.runPromise(
    classify({ ...settings, batchSize: 8, debug: true }, [post('t1'), post('t2'), post('t3')]),
  );
  expect(result.verdicts.map((verdict) => verdict.trace?.batch)).toEqual([3, 3, 3]);
  expect(Object.keys((result.verdicts[0]!.trace!.request as any).questions)).toHaveLength(3);
});
