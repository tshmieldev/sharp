import { execFileSync } from 'node:child_process';
import { access, cp, mkdir, rm, stat } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

// Builds, then stages exactly what Chrome loads into a zip with manifest.json at
// the root, which is what both "Load unpacked" and the Web Store expect.

const STAGE = '.release';
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const output = `sharp-${manifest.version}.zip`;

console.log('Building…');
execFileSync('bun', ['scripts/build.mjs'], { stdio: 'inherit' });

const files = [
  'manifest.json',
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...new Set([...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)]),
  ...manifest.content_scripts.flatMap((script) => [...script.js, ...(script.css ?? [])]),
  'popup.js',
  'popup.css',
];
const unique = [...new Set(files)];

// A missing asset must fail here, not silently ship a broken zip.
await Promise.all(
  unique.map((file) =>
    access(file).catch(() => {
      throw new Error(`Missing ${file}. Run \`bun run build\` and try again.`);
    }),
  ),
);

await rm(STAGE, { recursive: true, force: true });
await mkdir(STAGE, { recursive: true });
for (const file of unique) {
  await cp(file, `${STAGE}/${file}`, { recursive: true });
}

await rm(output, { force: true });
try {
  execFileSync('zip', ['-r', '-q', '-X', `../${output}`, '.'], { cwd: STAGE, stdio: 'inherit' });
} catch (error) {
  throw new Error(`Could not run \`zip\`. Install it, or zip ${STAGE}/ by hand. ${error.message}`);
}
await rm(STAGE, { recursive: true, force: true });

const { size } = await stat(output);
console.log(`\n${output}  ${Math.round(size / 1024)} KB  ${unique.length} files`);
console.log(
  `\nPublish it with:\n  gh release create v${manifest.version} ${output} --generate-notes`,
);
