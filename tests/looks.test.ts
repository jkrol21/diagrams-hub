import { describe, expect, test } from 'bun:test';
import {
  buildTheme, lookVariables, parseLookDirectives, resolveTheme, roles, PALETTES, PALETTE_NAMES, LOOK_STYLES
} from '../src/lib/utils/looks';
import { CLASSIC_LIGHT, DEFAULT_THEME, normalizeTheme } from '../src/lib/stores/theme';

describe('looks', () => {
  test('styles differ the way they are described', () => {
    const outline = roles('indigo', 'outline');
    const solid = roles('indigo', 'solid');
    const soft = roles('indigo', 'soft');
    expect(outline.fill).toBe('#ffffff');
    expect(solid.text).toBe('#ffffff');
    expect(soft.fill).not.toBe(soft.stroke);
    expect(soft.fill).toBe('#e0e7ff'); // indigo-100 fill, indigo-500 border
    expect(soft.stroke).toBe('#6366f1');
  });

  test('every palette and style builds a complete theme', () => {
    for (const palette of PALETTE_NAMES) {
      for (const style of LOOK_STYLES) {
        const theme = buildTheme({ palette, style });
        expect(theme.look).toEqual({ palette, style });
        expect(Object.keys(theme.colors).sort()).toEqual(Object.keys(DEFAULT_THEME.colors).sort());
        expect(Object.values(lookVariables({ palette, style })).every((v) => /^#[0-9a-f]{6}$/.test(v))).toBe(true);
      }
    }
    expect(PALETTES.mono).toEqual(['slate']);
  });

  test('parses directives and reports invalid values with their line', () => {
    const code = 'flowchart LR\n  %% style: Solid\n%%palette=ocean\n%% style: fancy\n  A --> B';
    expect(parseLookDirectives(code)).toEqual({
      look: { style: 'solid', palette: 'ocean' },
      invalid: [{ key: 'style', value: 'fancy', line: 4 }]
    });
  });

  test('resolves directives over CLI overrides over the base theme', () => {
    const base = buildTheme({ palette: 'modern', style: 'soft' });
    expect(resolveTheme(base, 'flowchart LR')).toBe(base);
    expect(resolveTheme(base, 'flowchart LR', { style: 'outline' }).look).toEqual({ palette: 'modern', style: 'outline' });
    expect(resolveTheme(base, '%% palette: berry\nflowchart LR', { palette: 'ocean', style: 'solid' }).look)
      .toEqual({ palette: 'berry', style: 'solid' });
    // classic themes stay classic unless a look is requested
    expect(resolveTheme(CLASSIC_LIGHT, 'flowchart LR')).toBe(CLASSIC_LIGHT);
    expect(resolveTheme(CLASSIC_LIGHT, '%% style: solid\nflowchart LR').look).toEqual({ palette: 'modern', style: 'solid' });
  });

  test('default theme is modern/soft; old stored themes stay classic', () => {
    expect(DEFAULT_THEME.look).toEqual({ palette: 'modern', style: 'soft' });
    expect(normalizeTheme(null).look).toEqual({ palette: 'modern', style: 'soft' });
    expect(normalizeTheme({ id: 'light', name: 'Light', colors: CLASSIC_LIGHT.colors } as never).look).toBeNull();
    expect(normalizeTheme({ colors: { clusterBkg: '#eeeeee' } } as never).look).toEqual(DEFAULT_THEME.look);
  });
});
