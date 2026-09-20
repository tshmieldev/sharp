import { expect, it } from 'vitest';
import {
  createGate,
  feedbackMetadata,
  isWireMessage,
  isWireSwitch,
  pickSigning,
  type WireMessage,
} from '../src/x/wire-extract';

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

it('passes nothing on until "Teach X too" is on, and stops reading when it is off', () => {
  const headers: WireMessage = { aitf: 'wire', kind: 'headers', headers: { authorization: 'x' } };
  const metadata: WireMessage = { aitf: 'wire', kind: 'metadata', entries: [['1', 'AAA=']] };

  // Before the content script has spoken, messages wait; nothing is posted.
  const sent: WireMessage[] = [];
  const gate = createGate((message) => sent.push(message));
  gate.send(headers);
  gate.send(metadata);
  expect(sent).toEqual([]);
  expect(gate.reading).toBe(true);
  // On: what was held goes out, and the rest follows as it comes.
  gate.set(true);
  expect(sent).toEqual([headers, metadata]);
  gate.send(metadata);
  expect(sent).toHaveLength(3);

  // Off: what was held is dropped, nothing is posted, and there is no reading.
  const dropped: WireMessage[] = [];
  const off = createGate((message) => dropped.push(message));
  off.send(headers);
  off.set(false);
  off.send(metadata);
  expect(dropped).toEqual([]);
  expect(off.reading).toBe(false);
  // Switched on later, it starts clean rather than replaying what it dropped.
  off.set(true);
  expect(dropped).toEqual([]);
  expect(off.reading).toBe(true);

  // Held messages are bounded while waiting.
  const bounded: WireMessage[] = [];
  const small = createGate((message) => bounded.push(message), 2);
  for (let i = 0; i < 5; i++) small.send({ ...metadata, entries: [[String(i), 'A']] });
  small.set(true);
  expect(
    bounded.map((message) => (message.kind === 'metadata' ? message.entries[0]![0] : '')),
  ).toEqual(['3', '4']);
});

it('tells a switch apart from what the page script sends', () => {
  expect(isWireSwitch({ aitf: 'wire', kind: 'switch', on: true })).toBe(true);
  expect(isWireSwitch({ aitf: 'wire', kind: 'switch' })).toBe(false);
  expect(isWireSwitch({ aitf: 'wire', kind: 'headers', headers: {} })).toBe(false);
  // The content script's listener never mistakes a switch for data.
  expect(isWireMessage({ aitf: 'wire', kind: 'switch', on: true })).toBe(false);
});
