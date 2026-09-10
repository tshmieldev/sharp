import { expect, it } from 'vitest';
import { feedbackMetadata, isWireMessage, pickSigning } from '../src/x/wire-extract';

it('reads per-post feedback metadata out of a timeline response', () => {
  // The shape of HomeTimeline: entries, conversation modules with items, and
  // feedbackInfo beside the tweet, never inside it.
  const json = {
    data: {
      home: {
        home_timeline_urt: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                {
                  entryId: 'tweet-2097974326180155526',
                  content: {
                    entryType: 'TimelineTimelineItem',
                    itemContent: { tweet_results: { result: { rest_id: '2097974326180155526' } } },
                    feedbackInfo: { feedbackKeys: ['-1378668161'], feedbackMetadata: 'AAA=' },
                  },
                },
                {
                  entryId: 'home-conversation-1-2',
                  content: {
                    entryType: 'TimelineTimelineModule',
                    items: [
                      {
                        entryId: 'home-conversation-1-2-tweet-42',
                        item: {
                          itemContent: { tweet_results: { result: { rest_id: '42' } } },
                          feedbackInfo: { feedbackMetadata: 'BBB=' },
                        },
                      },
                    ],
                  },
                },
                {
                  entryId: 'who-to-follow-7',
                  content: { feedbackInfo: { feedbackMetadata: 'CCC=' } },
                },
                { entryId: 'cursor-bottom-1', content: { value: 'x' } },
              ],
            },
          ],
        },
      },
    },
  };
  expect(feedbackMetadata(json)).toEqual([
    ['2097974326180155526', 'AAA='],
    ['42', 'BBB='],
  ]);
  expect(feedbackMetadata({ a: [1, 'x', null] })).toEqual([]);
});

it('keeps only the signing headers, and only when both credentials are present', () => {
  expect(
    pickSigning(
      new Headers({
        authorization: 'Bearer t',
        'x-csrf-token': 'c',
        'x-client-transaction-id': 'tx',
        'x-twitter-active-user': 'yes',
        cookie: 'secret',
        'user-agent': 'ua',
      }),
    ),
  ).toEqual({
    authorization: 'Bearer t',
    'x-csrf-token': 'c',
    'x-client-transaction-id': 'tx',
    'x-twitter-active-user': 'yes',
  });
  expect(pickSigning(new Headers({ authorization: 'Bearer t' }))).toBeNull();
});

it('recognises only its own messages', () => {
  expect(isWireMessage({ aitf: 'wire', kind: 'headers', headers: {} })).toBe(true);
  expect(isWireMessage({ aitf: 'wire', kind: 'metadata', entries: [] })).toBe(true);
  expect(isWireMessage({ aitf: 'wire', kind: 'other' })).toBe(false);
  expect(isWireMessage({ kind: 'headers' })).toBe(false);
  expect(isWireMessage(null)).toBe(false);
});
