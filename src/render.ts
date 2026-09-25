/**
 * Headless render entry used by the CLI (`cli/diagrams-hub.mjs`).
 * Uses the same Mermaid config, icon packs and Excalidraw renderer as the
 * app. Opened as `render.html?job`, it fetches its job from the CLI's local
 * server (`GET /job`), renders, rasterizes the PNG itself and posts the
 * result back (`POST /result`), then closes — so the CLI can use any plain
 * headless Chrome/Edge, including a Windows browser started from WSL, without
 * a DevTools connection. `window.diagramsHub` exposes the same functions.
 */
import '@fontsource/caveat/400.css';
import { initializeMermaid, registerArchitectureIcons, renderDiagram, generateMermaidId } from './lib/utils/mermaidConfig';
import { renderExcalidraw } from './lib/utils/excalidrawRender';
import { detectDiagramMode, type DiagramMode } from './lib/utils/diagramMode';
import { locateError, findUnknownIcons, withHint, codeExcerpt, type Diagnostic } from './lib/utils/diagnostics';
import { DEFAULT_THEME, normalizeTheme } from './lib/stores/theme';
import { resolveTheme, parseLookDirectives, PALETTE_NAMES, LOOK_STYLES, type Look } from './lib/utils/looks';
import { applyLook } from './lib/utils/applyLook';
import { fontsReady } from './lib/utils/fonts';
import { svgToPngBlob } from './lib/utils/exportPng';
import type { ThemeConfig } from './lib/types';
import { hubIcons } from './lib/icons/hub';
import { buildLogoIconPack } from './lib/icons/logos';

export interface RenderResult {
  mode: DiagramMode;
  /** Error that prevented rendering (with line/column when known) */
  error: Diagnostic | null;
  /** Problems that still render, but probably not as intended */
  warnings: Diagnostic[];
  /** Palette + style used, or null for a classic theme / Excalidraw */
  look: Look | null;
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
  await Promise.all([registerArchitectureIcons(), fontsReady()]);
})();

/** Render and attach source excerpts to all diagnostics (the CLI is plain JS and just prints them) */
async function render(code: string, theme?: Partial<ThemeConfig>, look?: Partial<Look>): Promise<RenderResult> {
  const result = await renderDiagramResult(code, theme, look);
  const withExcerpt = (d: Diagnostic): Diagnostic =>
    d.line ? { ...d, excerpt: codeExcerpt(code, d.line, d.column) } : d;
  return {
    ...result,
    error: result.error && withExcerpt(result.error),
    warnings: result.warnings.map(withExcerpt)
  };
}

async function renderDiagramResult(
  code: string,
  theme?: Partial<ThemeConfig>,
  lookOverride?: Partial<Look>
): Promise<RenderResult> {
  await ready;
  const resolved = resolveTheme(normalizeTheme(theme), code, lookOverride);
  initializeMermaid(resolved);
  const out = document.getElementById('out')!;
  out.innerHTML = '';
  out.style.background = resolved.colors.background;

  const trimmed = code.trim();
  const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  const mode = detectDiagramMode(code);
  const result: RenderResult = {
    mode, error: null, warnings: [], look: mode === 'mermaid' ? resolved.look ?? null : null, width: 0, height: 0
  };
  for (const bad of parseLookDirectives(code).invalid) {
    const valid = bad.key === 'style' ? LOOK_STYLES : PALETTE_NAMES;
    result.warnings.push({
      message: `Unknown ${bad.key} "${bad.value}" (ignored). Valid: ${valid.join(', ')}.`,
      line: bad.line
    });
  }

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
  if (mode === 'mermaid' && resolved.look) applyLook(svgEl, resolved.look);
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

/** What the CLI asks for (`GET /job`) */
interface Job {
  command: 'render' | 'check' | 'icons';
  code?: string;
  theme?: Partial<ThemeConfig>;
  look?: Partial<Look>;
  /** Longest side of the PNG in pixels */
  maxSize?: number;
  /** Largest upscaling factor for small diagrams */
  maxScale?: number;
  /** Also return the SVG */
  svg?: boolean;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function runJob(job: Job): Promise<Record<string, unknown>> {
  if (job.command === 'icons') return { icons: await listIcons() };

  const result = await render(job.code ?? '', job.theme, job.look);
  if (result.error || job.command === 'check') return { result };

  const svg = getSvg();
  const scale = Math.min(job.maxScale ?? 2, (job.maxSize ?? 1200) / Math.max(result.width, result.height));
  const background = document.getElementById('out')!.style.background || '#ffffff';
  const png = await blobToBase64(await svgToPngBlob(svg, scale, background));
  return {
    result: { ...result, width: Math.round(result.width * scale), height: Math.round(result.height * scale) },
    png,
    svg: job.svg ? svg : undefined
  };
}

async function runJobFromServer(): Promise<void> {
  let body: Record<string, unknown>;
  try {
    const job: Job = await (await fetch('/job')).json();
    body = await runJob(job);
  } catch (err) {
    body = { failure: String((err as Error)?.stack ?? err) };
  }
  await fetch('/result', { method: 'POST', body: JSON.stringify(body) }).catch(() => {});
  window.close();
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

if (new URLSearchParams(location.search).has('job')) void runJobFromServer();
