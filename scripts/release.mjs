import { execFileSync } from 'node:child_process';
import { access, cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { assetsOf, manifestFor } from './manifest.mjs';

// Builds, then stages exactly what a browser loads into a zip with
// manifest.json at the root, which is what "Load unpacked", the Chrome Web
// Store and AMO all expect. One zip per target.

const STAGE = '.release';
const base = JSON.parse(await readFile('manifest.json', 'utf8'));
const targets = ['chrome', 'firefox'];
const built = [];

await rm(STAGE, { recursive: true, force: true });

for (const target of targets) {
  console.log(`Building ${target}…`);
  execFileSync('bun', ['scripts/build.mjs', `--target=${target}`], { stdio: 'inherit' });

  // Chrome builds into the repository root so the checkout stays loadable
  // unpacked; Firefox builds into a directory of its own.
  const root = target === 'firefox' ? 'firefox' : '.';
  const files = assetsOf(manifestFor(base, target));
  const stage = `${STAGE}/${target}`;
  const output = `sharp-${base.version}-${target}.zip`;

  // A missing asset must fail here, not silently ship a broken zip.
  await Promise.all(
    files.map((file) =>
      access(`${root}/${file}`).catch(() => {
        throw new Error(`Missing ${root}/${file}. Run \`bun run build\` and try again.`);
      }),
    ),
  );

  await mkdir(stage, { recursive: true });
  for (const file of files) {
    await cp(`${root}/${file}`, `${stage}/${file}`, { recursive: true });
  }

  await rm(output, { force: true });
  try {
    execFileSync('zip', ['-r', '-q', '-X', `../../${output}`, '.'], {
      cwd: stage,
      stdio: 'inherit',
    });
  } catch (error) {
    throw new Error(
      `Could not run \`zip\`. Install it, or zip ${stage}/ by hand. ${error.message}`,
    );
  }
  built.push({ output, files: files.length });
}

await rm(STAGE, { recursive: true, force: true });

console.log('');
for (const { output, files } of built) {
  const { size } = await stat(output);
  console.log(`${output}  ${Math.round(size / 1024)} KB  ${files} files`);
}
console.log(
  `\nPublish them with:\n  gh release create v${base.version} ${built
    .map((entry) => entry.output)
    .join(' ')} --generate-notes`,
);
console.log(`\nThe Firefox zip is what AMO takes at https://addons.mozilla.org/developers/.`);
