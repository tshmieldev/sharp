import type { PublicSettings } from '../common/settings';
import { articleSelector, postId } from './extract';
import { mountPostActions } from './post-actions';
import {
  dropdownSelector,
  installMenuKeyboard,
  matchMenuStyle,
  menuPost,
  moreSelector,
  nativeItems,
  visible,
} from './post-menu-dom';

type Session = {
  dropdown: HTMLElement;
  root: HTMLElement;
  key: string;
  dispose: () => void;
};

/** Observe X's portal, not the timing of a click. Already-open and staged menus
 * follow the same rule: one visible dropdown with a native, exact post identity. */
export function installPostMenu(getSettings: () => PublicSettings | null) {
  let current: Session | null = null;
  let dismissed: { dropdown: HTMLElement; key: string } | null = null;
  let observedPortal: HTMLElement | null | undefined;
  let disposed = false;
  const cancel = () => {
    const previous = current;
    current = null;
    previous?.dispose();
  };
  const suppress = () => {
    if (current) dismissed = { dropdown: current.dropdown, key: current.key };
    cancel();
  };

  function inspect() {
    if (disposed) return;
    const portal = document.getElementById('layers');
    if (portal !== observedPortal) {
      observer.disconnect();
      observedPortal = portal;
      if (portal) {
        // Watch portal contents plus direct ancestor removal/visibility. Never
        // keep a whole-page subtree observer running once #layers exists.
        for (let node: HTMLElement | null = portal; node; node = node.parentElement) {
          observer.observe(node, {
            childList: true,
            subtree: node === portal,
            characterData: node === portal,
            attributes: true,
            attributeFilter: [
              'hidden',
              'aria-hidden',
              'style',
              'class',
              'href',
              'data-testid',
              'role',
            ],
          });
        }
      } else {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }
    if (dismissed && !visible(dismissed.dropdown)) dismissed = null;
    const settings = getSettings();
    const menus = [...(portal?.querySelectorAll<HTMLElement>(dropdownSelector) ?? [])]
      .map((dropdown) => ({ dropdown, post: menuPost(dropdown) }))
      .filter((menu) => menu.post !== null);
    const menu = menus.length === 1 ? menus[0] : undefined;
    if (!settings || !menu?.post) {
      cancel();
      return;
    }
    const { dropdown, post } = menu;
    const key = `${post.id}:${post.handle.toLowerCase()}`;
    if (dismissed?.dropdown === dropdown && dismissed.key === key) return;
    if (current?.dropdown === dropdown && current.key === key && current.root.isConnected) return;
    cancel();
    const sample = nativeItems(dropdown).at(-1);
    if (!sample) return;
    const root = document.createElement('div');
    root.className = 'aitf-post-menu';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Sharp');
    matchMenuStyle(root, sample);
    // Below X's own actions: the extension adds to the menu, it does not lead it.
    dropdown.append(root);
    const path = location.pathname;
    const isCurrent = () => {
      const identity = menuPost(dropdown);
      return (
        !disposed &&
        current?.root === root &&
        root.isConnected &&
        path === location.pathname &&
        identity?.id === post.id &&
        identity.handle.toLowerCase() === post.handle.toLowerCase() &&
        Boolean(getSettings())
      );
    };
    const unmount = mountPostActions(root, {
      handle: post.handle,
      settings,
      isCurrent,
      dismiss: () => {
        if (!isCurrent()) return;
        // Ask X to close its own portal; don't activate or remove native items.
        dismissed = { dropdown, key };
        const target =
          document.activeElement instanceof HTMLElement && dropdown.contains(document.activeElement)
            ? document.activeElement
            : dropdown;
        target.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
            cancelable: true,
          }),
        );
        if (current?.root === root) cancel();
      },
    });
    const removeKeyboard = installMenuKeyboard(dropdown, root);
    current = {
      dropdown,
      root,
      key,
      dispose: () => {
        removeKeyboard();
        unmount();
        root.remove();
      },
    };
  }

  const observer = new MutationObserver(inspect);
  const keydown = (event: KeyboardEvent) => {
    if (!current || !['Escape', 'Tab'].includes(event.key)) return;
    const previous = current;
    const id = menuPost(previous.dropdown)?.id;
    const trigger = [...document.querySelectorAll(articleSelector)]
      .find((article) => postId(article) === id)
      ?.querySelector<HTMLElement>(moreSelector);
    dismissed = { dropdown: previous.dropdown, key: previous.key };
    queueMicrotask(() => {
      if (current === previous) cancel();
      if (
        event.key === 'Escape' &&
        document.activeElement === document.body &&
        trigger &&
        visible(trigger)
      )
        trigger.focus({ preventScroll: true });
    });
  };
  const outside = (event: Event) => {
    if (current && event.target instanceof Node && !current.dropdown.contains(event.target))
      suppress();
  };
  const navigation =
    'navigation' in window && window.navigation instanceof EventTarget ? window.navigation : null;
  document.addEventListener('keydown', keydown, true);
  document.addEventListener('pointerdown', outside, true);
  navigation?.addEventListener('navigate', suppress);
  window.addEventListener('popstate', suppress);
  window.addEventListener('pagehide', suppress);
  inspect();
  return () => {
    disposed = true;
    observer.disconnect();
    cancel();
    document.removeEventListener('keydown', keydown, true);
    document.removeEventListener('pointerdown', outside, true);
    navigation?.removeEventListener('navigate', suppress);
    window.removeEventListener('popstate', suppress);
    window.removeEventListener('pagehide', suppress);
  };
}
