/**
 * Smoke test: render every file in examples/ with the CLI into
 * .cli-cache/examples/. Exits non-zero if any example fails to render.
 * Plain JS so it runs with `npm run examples` as well as `bun run examples`.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.cli-cache', 'examples');
const files = readdirSync(join(root, 'examples')).filter((f) => /\.(mmd|json)$/.test(f)).sort();

let failed = 0;
for (const file of files) {
  const out = join(outDir, file.replace(/\.[^.]+$/, '.png'));
  const res = spawnSync(process.execPath, [join(root, 'cli/diagrams-hub.mjs'), 'render', join(root, 'examples', file), '-o', out], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const ok = res.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}${ok ? '' : '\n' + res.stdout}`);
}
console.log(`\n${files.length - failed}/${files.length} rendered -> ${outDir}`);
process.exit(failed ? 1 : 0);
