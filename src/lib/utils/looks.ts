/**
 * "Looks": a color palette plus a box style, so every diagram (and every
 * agent-rendered PNG) comes out in one consistent, modern color scheme.
 *
 * - style `outline`: strong color on the border only, white fill
 * - style `solid`:   strong color fill, white text
 * - style `soft`:    light tint fill with a darker border of the same hue
 *                    (Excalidraw-like)
 *
 * Groups (subgraphs, namespaces, architecture groups) take the palette's hues
 * in order and the nodes inside inherit their group's hue (see applyLook.ts);
 * everything else uses the palette's first hue via Mermaid theme variables.
 *
 * A diagram can pick its look in the code with comment directives, which both
 * the app and the CLI honor:  `%% style: soft`  and  `%% palette: ocean`
 */
import type { ThemeConfig } from '../types';

export type LookStyle = 'outline' | 'solid' | 'soft';

export interface Look {
  palette: PaletteName;
  style: LookStyle;
}

type Shade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
type Scale = Record<Shade, string>;

// Tailwind CSS color scales
const SCALES = {
  slate: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a' },
  blue: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a' },
  indigo: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81' },
  violet: { 50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95' },
  fuchsia: { 50: '#fdf4ff', 100: '#fae8ff', 200: '#f5d0fe', 300: '#f0abfc', 400: '#e879f9', 500: '#d946ef', 600: '#c026d3', 700: '#a21caf', 800: '#86198f', 900: '#701a75' },
  pink: { 50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899', 600: '#db2777', 700: '#be185d', 800: '#9d174d', 900: '#831843' },
  rose: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337' },
  red: { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d' },
  orange: { 50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412', 900: '#7c2d12' },
  amber: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f' },
  lime: { 50: '#f7fee7', 100: '#ecfccb', 200: '#d9f99d', 300: '#bef264', 400: '#a3e635', 500: '#84cc16', 600: '#65a30d', 700: '#4d7c0f', 800: '#3f6212', 900: '#365314' },
  green: { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d' },
  emerald: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b' },
  teal: { 50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a' },
  cyan: { 50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75', 900: '#164e63' },
  sky: { 50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e' }
} satisfies Record<string, Scale>;

type Hue = keyof typeof SCALES;

/** Palettes: hues in the order they are given to groups; the first is the main color */
export const PALETTES = {
  modern: ['indigo', 'teal', 'amber', 'rose', 'sky', 'violet', 'emerald'],
  ocean: ['blue', 'cyan', 'teal', 'indigo', 'sky'],
  sunset: ['orange', 'rose', 'amber', 'fuchsia', 'red'],
  forest: ['emerald', 'teal', 'lime', 'green', 'cyan'],
  berry: ['violet', 'fuchsia', 'pink', 'indigo', 'rose'],
  mono: ['slate']
} satisfies Record<string, Hue[]>;

export type PaletteName = keyof typeof PALETTES;

export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[];
export const LOOK_STYLES: LookStyle[] = ['soft', 'solid', 'outline'];
export const DEFAULT_LOOK: Look = { palette: 'modern', style: 'soft' };

const SLATE = SCALES.slate;

/** Colors a node / group / architecture tile gets in a given hue */
export interface Roles {
  fill: string;
  stroke: string;
  text: string;
  groupFill: string;
  groupStroke: string;
  groupText: string;
  tileFill: string;
  tileStroke: string;
  icon: string;
  strokeWidth: number;
  /** stroke-dasharray for group borders */
  groupDash: string;
}

export function roles(hue: Hue, style: LookStyle): Roles {
  const c = SCALES[hue];
  switch (style) {
    case 'outline':
      return {
        fill: '#ffffff', stroke: c[600], text: SLATE[800],
        groupFill: '#ffffff', groupStroke: c[400], groupText: c[700],
        tileFill: '#ffffff', tileStroke: c[600], icon: c[600], strokeWidth: 2, groupDash: '6 4'
      };
    case 'solid':
      return {
        fill: c[600], stroke: c[700], text: '#ffffff',
        groupFill: c[50], groupStroke: c[200], groupText: c[800],
        tileFill: c[600], tileStroke: c[700], icon: '#ffffff', strokeWidth: 1.5, groupDash: 'none'
      };
    case 'soft':
      return {
        fill: c[100], stroke: c[500], text: SLATE[800],
        groupFill: c[50], groupStroke: c[300], groupText: c[700],
        tileFill: c[100], tileStroke: c[500], icon: c[700], strokeWidth: 1.5, groupDash: 'none'
      };
  }
}

/** Roles for the i-th hue of a palette (cycling) */
export function paletteRoles(look: Look, index: number): Roles {
  const hues = PALETTES[look.palette];
  return roles(hues[index % hues.length], look.style);
}

/** Full theme for a look (the base colors; group hues are applied after rendering) */
export function buildTheme(look: Look, fonts?: ThemeConfig['fonts']): ThemeConfig {
  const main = paletteRoles(look, 0);
  const second = paletteRoles(look, 1);
  return {
    id: `${look.palette}-${look.style}`,
    name: `${capitalize(look.palette)} · ${capitalize(look.style)}`,
    look,
    colors: {
      primaryColor: main.fill,
      primaryTextColor: main.text,
      primaryBorderColor: main.stroke,
      lineColor: SLATE[500],
      secondaryColor: second.fill,
      tertiaryColor: SLATE[100],
      background: '#ffffff',
      mainBkg: main.fill,
      textColor: SLATE[700],
      nodeTextColor: main.text,
      clusterBkg: main.groupFill,
      clusterBorder: main.groupStroke,
      titleColor: main.groupText,
      edgeLabelBackground: '#ffffff',
      noteBkgColor: SCALES.amber[50],
      noteBorderColor: SCALES.amber[300],
      archEdgeColor: SLATE[400]
    },
    fonts: fonts ?? { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14 }
  };
}

/**
 * Mermaid theme variables that only make sense with a palette: section colors
 * (mindmap, timeline, journey), pie slices, gantt bars, sequence details.
 */
export function lookVariables(look: Look): Record<string, string> {
  const vars: Record<string, string> = {};
  const hues = PALETTES[look.palette];
  const main = paletteRoles(look, 0);
  const second = paletteRoles(look, 1);

  for (let i = 0; i < 12; i++) {
    const c = SCALES[hues[i % hues.length]];
    const fill = look.style === 'solid' ? c[500] : look.style === 'soft' ? c[200] : c[100];
    vars[`cScale${i}`] = fill;
    vars[`cScalePeer${i}`] = c[600];
    vars[`cScaleInv${i}`] = look.style === 'solid' ? c[700] : look.style === 'soft' ? c[400] : c[500];
    vars[`cScaleLabel${i}`] = look.style === 'solid' ? '#ffffff' : SLATE[800];
    vars[`pie${i + 1}`] = look.style === 'soft' ? c[300] : c[500];
  }
  vars.pieStrokeColor = '#ffffff';
  vars.pieOuterStrokeColor = SLATE[200];
  vars.pieTitleTextColor = SLATE[800];
  vars.pieSectionTextColor = look.style === 'soft' ? SLATE[800] : '#ffffff';

  // Sequence diagrams
  vars.actorBkg = main.fill;
  vars.actorBorder = main.stroke;
  vars.actorTextColor = main.text;
  vars.actorLineColor = SLATE[300];
  vars.signalColor = SLATE[600];
  vars.signalTextColor = SLATE[700];
  vars.labelBoxBkgColor = main.groupFill;
  vars.labelBoxBorderColor = main.groupStroke;
  vars.labelTextColor = SLATE[800];
  vars.loopTextColor = SLATE[700];
  vars.activationBkgColor = main.groupFill;
  vars.activationBorderColor = main.groupStroke;
  vars.sequenceNumberColor = '#ffffff';

  // Gantt
  vars.taskBkgColor = main.fill;
  vars.taskBorderColor = main.stroke;
  vars.taskTextColor = main.text;
  vars.taskTextLightColor = main.text;
  vars.taskTextDarkColor = SLATE[800];
  vars.taskTextOutsideColor = SLATE[700];
  vars.activeTaskBkgColor = second.fill;
  vars.activeTaskBorderColor = second.stroke;
  vars.doneTaskBkgColor = SLATE[200];
  vars.doneTaskBorderColor = SLATE[400];
  vars.critBkgColor = roles('rose', look.style).fill;
  vars.critBorderColor = roles('rose', look.style).stroke;
  vars.sectionBkgColor = main.groupFill;
  vars.sectionBkgColor2 = second.groupFill;
  vars.altSectionBkgColor = '#ffffff';
  vars.gridColor = SLATE[200];
  vars.todayLineColor = SCALES.rose[500];

  // ER attribute rows stay light so their (dark) text is readable in every style
  vars.attributeBackgroundColorOdd = '#ffffff';
  vars.attributeBackgroundColorEven = SLATE[50];

  return vars;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function isLookStyle(value: string): value is LookStyle {
  return (LOOK_STYLES as string[]).includes(value);
}

export function isPaletteName(value: string): value is PaletteName {
  return value in PALETTES;
}

export interface LookDirectives {
  look: Partial<Look>;
  /** Directive values that aren't valid (reported as warnings) */
  invalid: Array<{ key: 'style' | 'palette'; value: string; line: number }>;
}

/** Read `%% style: soft` / `%% palette: ocean` comment lines from diagram code */
export function parseLookDirectives(code: string): LookDirectives {
  const result: LookDirectives = { look: {}, invalid: [] };
  code.split('\n').forEach((text, i) => {
    const m = /^\s*%%\s*(style|palette)\s*[:=]\s*([\w-]+)\s*$/i.exec(text);
    if (!m) return;
    const key = m[1].toLowerCase() as 'style' | 'palette';
    const value = m[2].toLowerCase();
    if (key === 'style' && isLookStyle(value)) result.look.style = value;
    else if (key === 'palette' && isPaletteName(value)) result.look.palette = value;
    else result.invalid.push({ key, value, line: i + 1 });
  });
  return result;
}

/**
 * The theme a diagram is actually rendered with. Priority: directives in the
 * code, then `override` (CLI flags), then the base theme (Style panel / --theme).
 * A classic theme (no look) stays untouched unless a style/palette is requested.
 */
export function resolveTheme(base: ThemeConfig, code: string, override: Partial<Look> = {}): ThemeConfig {
  const requested = { ...override, ...parseLookDirectives(code).look };
  if (!requested.style && !requested.palette) return base;
  const look: Look = {
    palette: requested.palette ?? base.look?.palette ?? DEFAULT_LOOK.palette,
    style: requested.style ?? base.look?.style ?? DEFAULT_LOOK.style
  };
  if (base.look && base.look.palette === look.palette && base.look.style === look.style) return base;
  return buildTheme(look, base.fonts);
}

/** Swatch colors for UI previews: main fill/stroke per hue */
export function paletteSwatches(palette: PaletteName, style: LookStyle): Array<{ fill: string; stroke: string }> {
  return PALETTES[palette].map((hue) => {
    const r = roles(hue, style);
    return { fill: r.fill, stroke: r.stroke };
  });
}
