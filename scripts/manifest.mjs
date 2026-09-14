// The manifest in the repository is Chrome's, so the checkout stays loadable
// unpacked. Everything Firefox needs differently lives here.

/** AMO keys an add-on on this. It must not change between releases, and
 *  `storage.sync` needs it to have somewhere to write. */
export const GECKO_ID = 'sharp@tshmieldev.github.io';
/** What the extension needs to run at all: 128 for MAIN-world content scripts,
 *  module event pages and `optional_host_permissions`, 133 for
 *  `storage.local.getBytesInUse`. The floor is 140 because that is where
 *  `data_collection_permissions` below starts being honoured, and 140 is the
 *  current ESR, so nothing still supported is excluded. */
export const GECKO_MIN_VERSION = '140.0';

/** The manifest a target actually loads, given the Chrome one in the
 *  repository. Chrome's is returned unchanged; Firefox's differs only in the
 *  keys below. */
export function manifestFor(base, target) {
  if (target !== 'firefox') return base;
  const { background, ...rest } = base;
  return {
    ...rest,
    // Firefox MV3 runs the background as an event page, not a service worker.
    // Same bundle either way: the code touches no worker-only globals.
    background: { scripts: [background.service_worker], type: background.type },
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        strict_min_version: GECKO_MIN_VERSION,
        // AMO requires this declaration. Nothing reaches the developer — there
        // is no server — but post text, handles and reply context do go to the
        // AI provider the reader configured, which is a third party, and that
        // is the whole point of the extension rather than something optional.
        // See privacy-policy.md.
        data_collection_permissions: { required: ['websiteContent'] },
      },
    },
  };
}

/** Every file a packaged build contains, relative to its own root. */
export function assetsOf(manifest) {
  const background = manifest.background.service_worker ?? manifest.background.scripts[0];
  return [
    ...new Set([
      'manifest.json',
      background,
      manifest.action.default_popup,
      ...Object.values(manifest.icons),
      ...Object.values(manifest.action.default_icon),
      ...manifest.content_scripts.flatMap((script) => [...script.js, ...(script.css ?? [])]),
      'popup.js',
      'popup.css',
    ]),
  ];
}
