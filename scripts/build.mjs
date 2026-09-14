import { context } from 'esbuild';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { assetsOf, manifestFor } from './manifest.mjs';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
// Readable output with inline source maps, for reading stack traces in the
// browser. Watching implies it; a one-off `--debug` build gets the same
// without watching.
const debug = watch || args.includes('--debug');
const flag = args.find((arg) => arg.startsWith('--target='));
const target = flag ? flag.slice('--target='.length) : 'chrome';
if (target !== 'chrome' && target !== 'firefox') {
  throw new Error(`Unknown ${flag}. Use --target=chrome or --target=firefox.`);
}
const base = JSON.parse(await readFile('manifest.json', 'utf8'));
const manifest = manifestFor(base, target);

// Chrome's build stays at the repository root, preserving the unpacked
// extension's ID and local settings across rebuilds. Firefox needs a different
// manifest, so its build gets a directory of its own to point
// about:debugging at — the JavaScript and CSS in it are freshly compiled, not
// copies of Chrome's.
const out = target === 'firefox' ? 'firefox/' : '';
if (out) {
  await mkdir(out, { recursive: true });
  await cp('icons', `${out}icons`, { recursive: true });
  await writeFile(`${out}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
}
await cp('src/popup/index.html', `${out}popup.html`);

const options = {
  bundle: true,
  define: {
    __BUILD_ID__: JSON.stringify(new Date().toISOString()),
    __TARGET__: JSON.stringify(target),
  },
  target: target === 'firefox' ? 'firefox133' : 'chrome120',
  sourcemap: debug ? 'inline' : false,
  minify: !debug,
  legalComments: 'none',
  logLevel: 'info',
};
const builds = await Promise.all([
  context({
    ...options,
    entryPoints: ['src/background/index.ts'],
    outfile: `${out}background.js`,
    format: 'esm',
  }),
  // Content scripts are classic scripts, not ES modules.
  context({
    ...options,
    entryPoints: ['src/index.ts'],
    outfile: `${out}content.js`,
    format: 'iife',
  }),
  // Runs in the page's own world (manifest `world: MAIN`): no chrome.*, and
  // nothing shared with the rest of the extension beyond pure helpers.
  context({
    ...options,
    entryPoints: ['src/x/wire.ts'],
    outfile: `${out}wire.js`,
    format: 'iife',
  }),
  context({
    ...options,
    entryPoints: ['src/popup/index.tsx'],
    outfile: `${out}popup.js`,
    format: 'esm',
  }),
]);
if (watch) {
  await Promise.all(builds.map((build) => build.watch()));
  console.log(
    `Watching source files for ${target}. Reload the extension and X tabs after changes.`,
  );
} else {
  try {
    await Promise.all(builds.map((build) => build.rebuild()));
    // `manifest.json` is written above for Firefox and committed for Chrome,
    // so only Chrome's root needs it checked from the repository.
    await Promise.all(assetsOf(manifest).map((asset) => access(`${out}${asset}`)));
    const where = out ? `${process.cwd()}/${out.replace(/\/$/, '')}` : process.cwd();
    console.log(
      `Built ${debug ? 'a debug build' : 'the extension'} for ${target} in ${where}.\n` +
        (target === 'firefox'
          ? 'Load firefox/manifest.json in about:debugging → This Firefox → Load Temporary Add-on.'
          : 'Load this directory in Chrome.'),
    );
  } finally {
    await Promise.all(builds.map((build) => build.dispose()));
  }
}
