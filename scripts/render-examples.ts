/**
 * Smoke test: render every file in examples/ with the CLI into
 * .cli-cache/examples/. Exits non-zero if any example fails to render.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const outDir = join(root, '.cli-cache', 'examples');
const files = readdirSync(join(root, 'examples')).filter((f) => /\.(mmd|json)$/.test(f)).sort();

let failed = 0;
for (const file of files) {
  const out = join(outDir, file.replace(/\.[^.]+$/, '.png'));
  const res = spawnSync(process.execPath, [join(root, 'cli/diagrams-hub.ts'), 'render', join(root, 'examples', file), '-o', out], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const ok = res.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}${ok ? '' : '\n' + res.stdout}`);
}
console.log(`\n${files.length - failed}/${files.length} rendered -> ${outDir}`);
process.exit(failed ? 1 : 0);
