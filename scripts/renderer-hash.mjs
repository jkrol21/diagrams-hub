/**
 * Hash of everything that goes into the committed renderer build (cli/renderer).
 * scripts/build-renderer.mjs stores it in cli/renderer/SOURCE_HASH and
 * tests/renderer.test.ts fails when the build is older than the sources.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUTS = ['src', 'render.html', 'vite.render.config.ts', 'package.json', 'bun.lock'];

function files(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((entry) => files(join(path, entry)));
}

export function rendererSourceHash() {
  const hash = createHash('sha256');
  const all = INPUTS.map((p) => join(ROOT, p)).filter(existsSync).flatMap(files)
    .map((f) => relative(ROOT, f).split('\\').join('/'))
    .sort();
  for (const file of all) {
    // Normalize line endings so a CRLF checkout hashes the same
    const content = readFileSync(join(ROOT, file)).toString('latin1').replace(/\r\n/g, '\n');
    hash.update(`${file}\0${content}\0`);
  }
  return hash.digest('hex');
}
