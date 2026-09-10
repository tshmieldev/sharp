import { context } from 'esbuild';
import { access, cp, readFile } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
// Readable output with inline source maps, for reading stack traces in Chrome.
// Watching implies it; a one-off `--debug` build gets the same without watching.
const debug = watch || process.argv.includes('--debug');
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
// Keep the repository root loadable, preserving the unpacked extension's ID
// and local settings when replacing the original JavaScript implementation.
await cp('src/popup/index.html', 'popup.html');

const options = {
  bundle: true,
  define: { __BUILD_ID__: JSON.stringify(new Date().toISOString()) },
  target: 'chrome120',
  sourcemap: debug ? 'inline' : false,
  minify: !debug,
  legalComments: 'none',
  logLevel: 'info',
};
const builds = await Promise.all([
  context({
    ...options,
    entryPoints: ['src/background/index.ts'],
    outfile: 'background.js',
    format: 'esm',
  }),
  // Chrome content scripts are classic scripts, not ES modules.
  context({
    ...options,
    entryPoints: ['src/index.ts'],
    outfile: 'content.js',
    format: 'iife',
  }),
  // Runs in the page's own world (manifest `world: MAIN`): no chrome.*, and
  // nothing shared with the rest of the extension beyond pure helpers.
  context({
    ...options,
    entryPoints: ['src/x/wire.ts'],
    outfile: 'wire.js',
    format: 'iife',
  }),
  context({
    ...options,
    entryPoints: ['src/popup/index.tsx'],
    outfile: 'popup.js',
    format: 'esm',
  }),
]);
if (watch) {
  await Promise.all(builds.map((build) => build.watch()));
  console.log('Watching source files. Reload the extension and X tabs after changes.');
} else {
  try {
    await Promise.all(builds.map((build) => build.rebuild()));
    const assets = [
      manifest.background.service_worker,
      manifest.action.default_popup,
      ...Object.values(manifest.icons),
      ...manifest.content_scripts.flatMap((script) => [...script.js, ...(script.css ?? [])]),
      'popup.js',
      'popup.css',
    ];
    await Promise.all(assets.map((asset) => access(asset)));
    console.log(
      `Built ${debug ? 'a debug build' : 'the extension'} in ${process.cwd()}. Load this directory in Chrome.`,
    );
  } finally {
    await Promise.all(builds.map((build) => build.dispose()));
  }
}
