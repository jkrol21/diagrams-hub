/**
 * Build the headless renderer (render.html -> cli/renderer) that the CLI uses,
 * and record the source hash. The output is committed: run this after changing
 * anything in src/ (or dependencies), then commit cli/renderer with the change.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, rendererSourceHash } from './renderer-hash.mjs';

const res = spawnSync(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '-c', 'vite.render.config.ts'], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (res.status !== 0) process.exit(res.status ?? 1);
writeFileSync(join(ROOT, 'cli/renderer/SOURCE_HASH'), rendererSourceHash() + '\n');
console.log('renderer built -> cli/renderer (commit it together with the source change)');
