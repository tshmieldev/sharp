// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { defaults, publicSettings, type Settings } from '../src/common/settings';
import { createRules } from '../src/x/rules';
import { ThreadControl } from '../src/x/thread-control';

const ID = '2099823495765017087';
const settings = (patch: Partial<Settings> = {}) =>
  publicSettings({ ...defaults, apiKeys: { openrouter: 'key' }, ...patch });
const post = { handle: 'alice', text: 'a reply' };

afterEach(() => {
  document.body.innerHTML = '';
  history.replaceState(null, '', '/');
});

it('leaves replies alone by default', () => {
  expect(defaults.filterComments).toBe(false);
  expect(createRules(settings())(post, '', ID, false, `/bob/status/${ID}`)).toBe('show');
});

it('judges replies once the reader turns comment filtering on', () => {
  const rule = createRules(settings({ filterComments: true }));
  expect(rule(post, '', ID, false, `/bob/status/${ID}`)).toBe('ai');
});

it('keeps filtering the timeline, which has no thread, either way', () => {
  expect(createRules(settings())(post, '', '', false, '/home')).toBe('ai');
});

it('never filters what the reader saved themselves: bookmarks, at either address', () => {
  const rule = createRules(settings({ blockedAuthors: ['alice'] }));
  for (const path of ['/i/bookmarks', '/i/history', '/i/history/', '/i/bookmarks/all']) {
    expect(rule(post, '', '', false, path)).toBe('show');
  }
  // A path that only starts the same way is still a timeline.
  expect(createRules(settings())(post, '', '', false, '/i/historyx')).toBe('ai');
});

it('always shows the opened post and its ancestors', () => {
  const rule = createRules(settings({ filterComments: true }));
  expect(rule(post, '', ID, true, `/bob/status/${ID}`)).toBe('show');
});

it('treats comment filtering off as absolute, like a bypassed thread', () => {
  // Same precedent as "Show all comments in this thread": nothing under the
  // post is hidden, blocked authors included.
  const rule = createRules(settings({ blockedAuthors: ['alice'] }));
  expect(rule(post, '', ID, false, `/bob/status/${ID}`)).toBe('show');
  expect(rule(post, '', '', false, '/home')).toBe('Blocked author');
});

const article = (handle: string, id: string) =>
  `<article data-testid="tweet"><div data-testid="User-Name"><a href="/${handle}">${handle}</a></div>` +
  `<a href="/${handle}/status/${id}"><time>now</time></a></article>`;
const reply = `<div data-testid="cellInnerDiv"><div class="reply">${article('alice', '2')}</div></div>`;

/** The shape of a desktop-width thread page, from a real capture: the inline
 *  reply box is a sibling of the opened post, inside the same cell. */
function desktopThread() {
  document.body.innerHTML =
    `<div data-testid="primaryColumn"><div data-testid="cellInnerDiv"><div><div>` +
    article('thenerd_be', ID) +
    `<div data-testid="inline_reply_offscreen"><div data-testid="tweetTextarea_0"></div>` +
    `<button data-testid="tweetButtonInline">Reply</button></div>` +
    `</div></div></div>${reply}</div>`;
  history.replaceState(null, '', `/thenerd_be/status/${ID}`);
}

it('mounts above the inline reply box on the desktop layout', () => {
  desktopThread();
  const control = new ThreadControl(async () => undefined as never);
  control.update(settings({ filterComments: true }));
  const root = document.querySelector('.aitf-thread-control');
  expect(root?.nextElementSibling?.getAttribute('data-testid')).toBe('inline_reply_offscreen');
  control.dispose();
});

it('shows no thread button while comments are not filtered', () => {
  desktopThread();
  const control = new ThreadControl(async () => undefined as never);
  control.update(settings({ filterComments: true }));
  expect(document.querySelector('.aitf-thread-control')).not.toBeNull();
  control.update(settings());
  expect(document.querySelector('.aitf-thread-control')).toBeNull();
});

it('falls back to the top of the replies when there is no inline reply box', () => {
  document.body.innerHTML =
    `<div data-testid="primaryColumn"><div data-testid="cellInnerDiv"><div>` +
    article('thenerd_be', ID) +
    `</div></div>${reply}</div>`;
  history.replaceState(null, '', `/thenerd_be/status/${ID}`);
  const control = new ThreadControl(async () => undefined as never);
  control.update(settings({ filterComments: true }));
  const root = document.querySelector('.aitf-thread-control');
  expect(root?.nextElementSibling?.classList.contains('reply')).toBe(true);
  control.dispose();
});

it('steps over the empty cell X puts between the opened post and its replies', () => {
  // As captured on Kiwi: an empty cell follows the focal post's.
  const spacer = `<div data-testid="cellInnerDiv"><div></div></div>`;
  document.body.innerHTML =
    `<div data-testid="primaryColumn"><div data-testid="cellInnerDiv"><div>` +
    article('thenerd_be', ID) +
    `</div></div>${spacer}${reply}</div>`;
  history.replaceState(null, '', `/thenerd_be/status/${ID}`);
  const control = new ThreadControl(async () => undefined as never);
  control.update(settings({ filterComments: true }));
  const root = document.querySelector('.aitf-thread-control');
  expect(root?.nextElementSibling?.classList.contains('reply')).toBe(true);
  control.dispose();
});
