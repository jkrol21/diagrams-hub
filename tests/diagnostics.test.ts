import { describe, expect, test } from 'bun:test';
import { codeExcerpt, diagnosticFromError, findUnknownIcons, locateError, withHint } from '../src/lib/utils/diagnostics';

const CODE = 'architecture-beta\n    servce a(lucide:globe)[A]\n';

describe('diagnostics', () => {
  test('uses the Langium parser result for positions', () => {
    const err = Object.assign(new Error('Parsing failed: ...'), {
      result: {
        lexerErrors: [],
        parserErrors: [{ message: "Expecting token of type ':' but found `a`.\nmore", token: { image: 'a', startLine: 2, startColumn: 12 } }],
      },
    });
    expect(diagnosticFromError(err, CODE)).toEqual({
      message: "Expecting token of type ':' but found `a`.",
      line: 2,
      column: 12,
    });
  });

  test('reports lexer errors with the offending character', () => {
    const code = 'architecture-beta\n  service b[B';
    const err = Object.assign(new Error('x'), {
      result: { lexerErrors: [{ message: 'x', offset: code.indexOf('['), length: 1 }], parserErrors: [] },
    });
    expect(diagnosticFromError(err, code)).toEqual({ message: 'Unexpected character "["', line: 2, column: 12 });
  });

  test('uses Jison hash.loc', () => {
    const err = Object.assign(new Error('Parse error on line 3:\n...'), { hash: { loc: { first_line: 3, first_column: 3 } } });
    expect(diagnosticFromError(err, 'a\nb\nc')).toMatchObject({ line: 3, column: 4 });
  });

  test('locates JSON positions and unknown ids', () => {
    expect(locateError('Unexpected token at position 5', '{\n "a" x}')).toEqual({ line: 2, column: 4 });
    expect(locateError('The right-hand id [zzz] does not yet exist.', 'x\na:R --> L:zzz')).toEqual({ line: 2, column: 11 });
  });

  test('excerpt marks line and column, clamps past-the-end lines', () => {
    expect(codeExcerpt('one\ntwo\nthree', 2, 2, 1)).toBe('  1 | one\n> 2 | two\n    |  ^\n  3 | three');
    expect(codeExcerpt('one\ntwo', 9)).toContain('> 2 | two');
  });

  test('flags unknown icons but accepts known and built-in ones', () => {
    const code = 'architecture-beta\n  service a(lucide:globe)[A]\n  service b(lucide:globez)[B]\n  service c(server)[C]';
    const warnings = findUnknownIcons(code, new Set(['lucide:globe']));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ line: 3, column: 13 });
  });

  test('adds hints for architecture-beta mistakes', () => {
    expect(withHint({ message: 'm', line: 2 }, CODE).message).toContain('"servce" is not a keyword');
    const edge = 'architecture-beta\n  a:X --> L:b';
    expect(withHint({ message: 'm', line: 2 }, edge).message).toContain('Edges look like');
    const ok = 'architecture-beta\n  a:R --> L:b';
    expect(withHint({ message: 'm', line: 2 }, ok).message).toBe('m');
  });
});
