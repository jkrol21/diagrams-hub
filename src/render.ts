/**
 * Headless render entry used by the CLI (`cli/diagrams-hub.ts`).
 * Uses the same Mermaid config, icon packs and Excalidraw renderer as the
 * app and exposes `window.diagramsHub` for the CLI to drive via Chromium.
 */
import '@fontsource/caveat/400.css';
import { initializeMermaid, registerArchitectureIcons, renderDiagram, generateMermaidId } from './lib/utils/mermaidConfig';
import { renderExcalidraw } from './lib/utils/excalidrawRender';
import { detectDiagramMode, type DiagramMode } from './lib/utils/diagramMode';
import { locateError, findUnknownIcons, withHint, type Diagnostic } from './lib/utils/diagnostics';
import { DEFAULT_THEME, normalizeTheme } from './lib/stores/theme';
import type { ThemeConfig } from './lib/types';
import { hubIcons } from './lib/icons/hub';
import { buildLogoIconPack } from './lib/icons/logos';

export interface RenderResult {
  mode: DiagramMode;
  /** Error that prevented rendering (with line/column when known) */
  error: Diagnostic | null;
  /** Problems that still render, but probably not as intended */
  warnings: Diagnostic[];
  width: number;
  height: number;
}

let knownIcons: Set<string> | null = null;

async function iconNames(): Promise<Set<string>> {
  if (knownIcons) return knownIcons;
  const { icons: lucide } = await import('@iconify-json/lucide');
  const names = new Set<string>();
  for (const pack of [lucide, hubIcons, await buildLogoIconPack()]) {
    if (!pack) continue;
    for (const name of [...Object.keys(pack.icons), ...Object.keys(pack.aliases ?? {})]) {
      names.add(`${pack.prefix}:${name}`);
    }
  }
  return (knownIcons = names);
}

const ready = (async () => {
  initializeMermaid(DEFAULT_THEME);
  await registerArchitectureIcons();
})();

async function render(code: string, theme?: Partial<ThemeConfig>): Promise<RenderResult> {
  await ready;
  const resolved = normalizeTheme(theme);
  initializeMermaid(resolved);
  const out = document.getElementById('out')!;
  out.innerHTML = '';
  out.style.background = resolved.colors.background;

  const trimmed = code.trim();
  const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  const mode = detectDiagramMode(code);
  const result: RenderResult = { mode, error: null, warnings: [], width: 0, height: 0 };

  if (!trimmed) {
    result.error = { message: 'Empty input: expected Mermaid code or Excalidraw JSON.' };
    return result;
  }

  // JSON that isn't Excalidraw would otherwise produce a confusing Mermaid error
  if (looksLikeJson && mode !== 'excalidraw') {
    try {
      JSON.parse(trimmed);
      result.error = {
        message: 'JSON input is not an Excalidraw document: expected {"type":"excalidraw","elements":[...]} ' +
          'or an array of elements with a "type" such as rectangle, ellipse, diamond, arrow, line or text.',
      };
    } catch (err) {
      const message = `Invalid JSON: ${(err as Error).message}`;
      result.error = { message, ...locateError(message, code) };
    }
    result.mode = 'excalidraw';
    return result;
  }

  const { svg, error, diagnostic }: { svg: string; error: string | null; diagnostic?: Diagnostic } =
    mode === 'excalidraw'
      ? await renderExcalidraw(code, { embedFont: true })
      : await renderDiagram(code, generateMermaidId());

  if (error) {
    result.error = withHint(diagnostic ?? { message: error, ...locateError(error, code) }, code);
    return result;
  }
  if (!svg) {
    result.error = { message: 'Nothing to render (no visible elements).' };
    return result;
  }

  if (mode === 'mermaid') result.warnings.push(...findUnknownIcons(code, await iconNames()));

  out.innerHTML = svg;
  const svgEl = out.querySelector('svg')!;
  const vb = svgEl.viewBox.baseVal;
  result.width = vb && vb.width ? vb.width : svgEl.getBoundingClientRect().width;
  result.height = vb && vb.height ? vb.height : svgEl.getBoundingClientRect().height;
  return result;
}

/** Scale the rendered SVG to exact pixel dimensions (for the screenshot) */
function setSize(width: number, height: number): void {
  const svgEl = document.querySelector<SVGSVGElement>('#out > svg');
  if (!svgEl) return;
  svgEl.setAttribute('width', String(width));
  svgEl.setAttribute('height', String(height));
  svgEl.style.width = `${width}px`;
  svgEl.style.height = `${height}px`;
}

function getSvg(): string {
  const svgEl = document.querySelector('#out > svg');
  return svgEl ? new XMLSerializer().serializeToString(svgEl) : '';
}

async function listIcons(): Promise<string[]> {
  return [...(await iconNames())].sort();
}

declare global {
  interface Window {
    diagramsHub: {
      render: typeof render;
      setSize: typeof setSize;
      getSvg: typeof getSvg;
      listIcons: typeof listIcons;
    };
  }
}

window.diagramsHub = { render, setSize, getSvg, listIcons };
