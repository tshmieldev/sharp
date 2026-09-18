// @vitest-environment jsdom
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { installPostMenu } from '../src/x/post-menu';
import { defaults, publicSettings } from '../src/common/settings';
import { mockChrome } from './chrome';

let dispose = () => {};
afterEach(() => {
  act(dispose);
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

it('adds author rules below the native actions in an already-open menu', async () => {
  const { chrome } = mockChrome();
  chrome.runtime.sendMessage.mockResolvedValue({ ok: true });
  // Relevant structure from the reported dropdown; no generated classes or SVG paths.
  document.body.innerHTML = `<div id="layers"><div role="menu"><div><div>
    <div data-testid="Dropdown">
      <div role="menuitem"><span>Unfollow @mattpocockuk</span></div>
      <div role="menuitem"><span>Mute</span></div>
      <div role="menuitem" data-testid="block"><span>Block @mattpocockuk</span></div>
      <a role="menuitem" data-testid="tweetEngagements"
        href="/mattpocockuk/status/2096980473754866081/quotes">View post activity</a>
      <a role="menuitem" href="/i/communitynotes/noterequest/2096980473754866081">
        Request Community Note
      </a>
    </div>
  </div></div></div></div>`;
  const native = [...document.querySelectorAll('[role="menuitem"]')];
  act(() => {
    dispose = installPostMenu(() => publicSettings(defaults));
  });
  const rows = [...document.querySelectorAll<HTMLButtonElement>('.aitf-menu-action')];
  expect(rows.map((row) => row.textContent)).toEqual([
    'Never filter @mattpocockuk',
    'Always hide @mattpocockuk',
  ]);
  expect([...document.querySelectorAll('[role="menuitem"]')]).toEqual([...native, ...rows]);
  await act(async () => {
    rows[1]!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
    type: 'SET_AUTHOR_RULE',
    handle: 'mattpocockuk',
    rule: 'block',
  });
});

it('offers to teach the model only when a model is configured', () => {
  const { chrome } = mockChrome();
  chrome.runtime.sendMessage.mockResolvedValue({ ok: true });
  document.body.innerHTML = `<div id="layers"><div role="menu"><div data-testid="Dropdown">
      <div role="menuitem"><span>Mute</span></div>
      <a role="menuitem" data-testid="tweetEngagements"
        href="/alice/status/42/quotes">View post activity</a>
    </div></div></div>`;
  const correct = vi.fn();
  act(() => {
    dispose = installPostMenu(() => publicSettings(defaults), correct);
  });
  expect([...document.querySelectorAll('.aitf-menu-action')]).toHaveLength(2);
  act(dispose);
  act(() => {
    dispose = installPostMenu(() => ({ ...publicSettings(defaults), configured: true }), correct);
  });
  const rows = [...document.querySelectorAll<HTMLButtonElement>('.aitf-menu-action')];
  expect(rows.map((row) => row.textContent)).toContain('Hide posts like this');
  act(() => rows.at(-1)!.click());
  expect(correct).toHaveBeenCalledWith('42', 'hide');
});

/** The phone-width menu from a Kiwi capture: a bottom sheet, no menu role,
 *  a backdrop beside it and X's own Cancel button last. */
const sheet = (items: string) => `<div id="layers"><div role="group"><div>
    <div data-testid="mask"></div>
    <div data-testid="sheetDialog">
      <div role="menuitem"><span>Not interested in this post</span></div>
      <div role="menuitem"><span>Follow @cifilter</span></div>
      <div role="menuitem" data-testid="block"><span>Block @cifilter</span></div>
      ${items}
      <a role="menuitem" href="/i/communitynotes/noterequest/2100245563170013389">
        Request Community Note
      </a>
      <button type="button">Cancel</button>
    </div>
  </div></div></div>`;

it('adds author rules to the bottom sheet X shows at phone widths, above Cancel', async () => {
  const { chrome } = mockChrome();
  chrome.runtime.sendMessage.mockResolvedValue({ ok: true });
  document.body.innerHTML = sheet(`<a role="menuitem" data-testid="tweetEngagements"
    href="/cifilter/status/2100245563170013389/quotes">View post activity</a>`);
  const mask = document.querySelector<HTMLElement>('[data-testid="mask"]')!;
  const dismissed = vi.fn();
  mask.addEventListener('click', dismissed);
  act(() => {
    dispose = installPostMenu(() => publicSettings(defaults));
  });
  const rows = [...document.querySelectorAll<HTMLButtonElement>('.aitf-menu-action')];
  expect(rows.map((row) => row.textContent)).toEqual([
    'Never filter @cifilter',
    'Always hide @cifilter',
  ]);
  const children = [...document.querySelector('[data-testid="sheetDialog"]')!.children];
  expect(children.at(-1)?.textContent).toBe('Cancel');
  expect(children.at(-2)?.classList.contains('aitf-post-menu')).toBe(true);
  await act(async () => {
    rows[0]!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
    type: 'SET_AUTHOR_RULE',
    handle: 'cifilter',
    rule: 'allow',
  });
  // Nothing in the test answers Escape, so the sheet is closed from its backdrop.
  expect(dismissed).toHaveBeenCalledOnce();
});

it('leaves other sheets alone, since only the post menu identifies a post', () => {
  mockChrome();
  document.body.innerHTML = sheet('');
  act(() => {
    dispose = installPostMenu(() => publicSettings(defaults));
  });
  expect(document.querySelector('.aitf-post-menu')).toBeNull();
});
