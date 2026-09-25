import { describe, expect, test } from 'bun:test';
import { normalizeSvgSize } from '../src/lib/utils/svg';
import { normalizeTheme, DEFAULT_THEME, CLASSIC_LIGHT, THEME_PRESETS } from '../src/lib/stores/theme';

describe('svg sizing', () => {
  test('replaces width="100%" and max-width with the viewBox size', () => {
    const svg = '<svg id="m" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 401.5px;" viewBox="0 0 401.5 357"><g/></svg>';
    const out = normalizeSvgSize(svg);
    expect(out).toContain('width="401.5" height="357"');
    expect(out).not.toContain('100%');
    expect(out).not.toContain('max-width');
    expect(out.endsWith('<g/></svg>')).toBe(true);
  });

  test('leaves SVGs without a usable viewBox alone', () => {
    const svg = '<svg width="10" height="10"><g/></svg>';
    expect(normalizeSvgSize(svg)).toBe(svg);
  });
});

describe('themes', () => {
  test('fills in colors missing from older stored themes', () => {
    const old = { id: 'custom', name: 'Custom', colors: { primaryColor: '#123456' }, fonts: { fontSize: 18 } };
    const t = normalizeTheme(old as never);
    expect(t.colors.primaryColor).toBe('#123456');
    expect(t.colors.clusterBkg).toBe(CLASSIC_LIGHT.colors.clusterBkg);
    expect(t.look).toBeNull();
    expect(t.fonts).toEqual({ fontFamily: DEFAULT_THEME.fonts.fontFamily, fontSize: 18 });
  });

  test('presets define every color', () => {
    const keys = Object.keys(DEFAULT_THEME.colors).sort();
    for (const preset of THEME_PRESETS) expect(Object.keys(preset.colors).sort()).toEqual(keys);
  });
});
