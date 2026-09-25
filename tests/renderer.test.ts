import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error plain JS helper without types
import { ROOT, rendererSourceHash } from '../scripts/renderer-hash.mjs';

describe('committed renderer (cli/renderer)', () => {
  test('is built from the current sources — otherwise run `npm run build:renderer` and commit it', () => {
    const stored = readFileSync(join(ROOT, 'cli/renderer/SOURCE_HASH'), 'utf8').trim();
    expect(stored).toBe(rendererSourceHash());
  });
});
