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
