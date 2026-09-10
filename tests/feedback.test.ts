// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Feedback } from '../src/x/feedback';

afterEach(() => vi.unstubAllGlobals());

const deliver = (data: unknown) =>
  window.dispatchEvent(
    new MessageEvent('message', { data, source: window, origin: location.origin }),
  );

it('sends X’s own request with the metadata and headers read off the wire', async () => {
  const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const feedback = new Feedback();
  feedback.start();
  expect(feedback.ready('1')).toBe(false);
  deliver({ aitf: 'wire', kind: 'metadata', entries: [['1', 'SSwW+A==']] });
  expect(feedback.ready('1')).toBe(false);
  deliver({
    aitf: 'wire',
    kind: 'headers',
    headers: { authorization: 'Bearer t', 'x-csrf-token': 'c', 'x-client-transaction-id': 'tx' },
  });
  expect(feedback.ready('1')).toBe(true);
  await expect(feedback.send('1')).resolves.toBe(true);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
  expect(url.pathname).toBe('/i/api/2/timeline/feedback.json');
  expect(url.searchParams.get('feedback_type')).toBe('DontLike');
  expect(url.searchParams.get('action_metadata')).toBe('SSwW+A==');
  expect(init.method).toBe('POST');
  expect(init.credentials).toBe('include');
  expect(init.body).toBe('feedback_type=DontLike&undo=false');
  expect(init.headers).toMatchObject({
    authorization: 'Bearer t',
    'x-csrf-token': 'c',
    'x-client-transaction-id': 'tx',
    'content-type': 'application/x-www-form-urlencoded',
  });
  await expect(feedback.send('1', true)).resolves.toBe(true);
  expect((fetchMock.mock.calls[1] as unknown as [URL, RequestInit])[1].body).toBe(
    'feedback_type=DontLike&undo=true',
  );
  feedback.stop();
});

it('fails soft on rejection, network errors and unknown posts', async () => {
  const fetchMock = vi.fn(async () => new Response('', { status: 403 }));
  vi.stubGlobal('fetch', fetchMock);
  const feedback = new Feedback();
  feedback.start();
  deliver({ aitf: 'wire', kind: 'metadata', entries: [['1', 'm']] });
  deliver({ aitf: 'wire', kind: 'headers', headers: { authorization: 'b', 'x-csrf-token': 'c' } });
  await expect(feedback.send('1')).resolves.toBe(false);
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  await expect(feedback.send('1')).resolves.toBe(false);
  await expect(feedback.send('2')).resolves.toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  feedback.stop();
});

it('ignores messages that are not from the page itself', () => {
  const feedback = new Feedback();
  feedback.start();
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { aitf: 'wire', kind: 'headers', headers: { authorization: 'b', 'x-csrf-token': 'c' } },
      origin: 'https://evil.example',
      source: window,
    }),
  );
  deliver({ aitf: 'wire', kind: 'metadata', entries: [['1', 'm']] });
  expect(feedback.ready('1')).toBe(false);
  feedback.stop();
});
