import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';
import caveatFontUrl from '@fontsource/caveat/files/caveat-latin-400-normal.woff2?url';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExcalidrawElement {
  id?: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  isDeleted?: boolean;
  roundness?: { type: number; value?: number } | null;
  // text
  text?: string;
  fontSize?: number;
  fontFamily?: number; // 1 = Virgil/Caveat, 2 = Helvetica, 3 = Cascadia/mono
  textAlign?: string;
  verticalAlign?: string;
  // linear / arrow
  points?: [number, number][];
  startArrowhead?: string | null;
  endArrowhead?: string | null;
}

interface ExcalidrawData {
  type?: string;
  elements: ExcalidrawElement[];
  appState?: { viewBackgroundColor?: string };
}

// ── Constants ──────────────────────────────────────────────────────────────

const PADDING = 20;
const SVG_NS = 'http://www.w3.org/2000/svg';

// ── Font cache ─────────────────────────────────────────────────────────────

let cachedFontBase64: string | null = null;

async function loadCaveatBase64(): Promise<string> {
  if (cachedFontBase64 !== null) return cachedFontBase64;
  try {
    const resp = await fetch(caveatFontUrl);
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    cachedFontBase64 = btoa(bin);
    return cachedFontBase64;
  } catch {
    cachedFontBase64 = '';
    return '';
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function strokeDash(style?: string): number[] | undefined {
  if (style === 'dashed') return [8, 8];
  if (style === 'dotted') return [3, 6];
  return undefined;
}

function toRoughFillStyle(style?: string): Options['fillStyle'] {
  const map: Record<string, Options['fillStyle']> = {
    hachure: 'hachure',
    solid: 'solid',
    'cross-hatch': 'cross-hatch',
    dots: 'dots',
    sunburst: 'sunburst',
    dashed: 'dashed',
    'zigzag-line': 'zigzag-line',
  };
  return map[style ?? 'hachure'] ?? 'hachure';
}

function roughOpts(el: ExcalidrawElement): Options {
  const opts: Options = {
    roughness: el.roughness ?? 1,
    bowing: 0.8,
    stroke: el.strokeColor || '#1e1e1e',
    strokeWidth: el.strokeWidth ?? 2,
    seed: hashId(el.id ?? el.type),
  };
  const dash = strokeDash(el.strokeStyle);
  if (dash) opts.strokeLineDash = dash;

  const bg = el.backgroundColor;
  if (bg && bg !== 'transparent') {
    opts.fill = bg;
    opts.fillStyle = toRoughFillStyle(el.fillStyle);
  } else {
    opts.fill = 'none';
  }
  return opts;
}

function fontFamily(f?: number): string {
  if (f === 2) return "'Helvetica Neue', Arial, sans-serif";
  if (f === 3) return "'Cascadia Code', 'Fira Code', 'Courier New', monospace";
  return "'Caveat', cursive"; // 1 = Virgil / default
}

// ── Bounding box ───────────────────────────────────────────────────────────

function getBounds(els: ExcalidrawElement[]): {
  minX: number; minY: number; maxX: number; maxY: number;
} {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const el of els) {
    if (el.isDeleted) continue;
    if ((el.type === 'line' || el.type === 'arrow') && el.points?.length) {
      for (const [px, py] of el.points) {
        minX = Math.min(minX, el.x + px);
        minY = Math.min(minY, el.y + py);
        maxX = Math.max(maxX, el.x + px);
        maxY = Math.max(maxY, el.y + py);
      }
    } else {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + (el.width || 0));
      maxY = Math.max(maxY, el.y + (el.height || 0));
    }
  }

  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  return { minX, minY, maxX, maxY };
}

// ── Rotation wrapper ───────────────────────────────────────────────────────

function withTransform(
  svgEl: SVGSVGElement,
  node: Element,
  el: ExcalidrawElement,
  ox: number,
  oy: number,
): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  const opacity = (el.opacity ?? 100) / 100;
  if (opacity < 1) g.setAttribute('opacity', String(opacity));

  if (el.angle) {
    const cx = ox + el.x + (el.width || 0) / 2;
    const cy = oy + el.y + (el.height || 0) / 2;
    const deg = (el.angle * 180) / Math.PI;
    g.setAttribute('transform', `rotate(${deg.toFixed(3)}, ${cx.toFixed(2)}, ${cy.toFixed(2)})`);
  }

  g.appendChild(node);
  svgEl.appendChild(g);
  return g;
}

// ── Element renderers ──────────────────────────────────────────────────────

type RC = ReturnType<typeof rough.svg>;

function renderRectangle(rc: RC, svgEl: SVGSVGElement, el: ExcalidrawElement, ox: number, oy: number) {
  const opts = roughOpts(el);
  if (el.roundness) {
    const maxR = Math.min(el.width, el.height) / 2;
    (opts as Options & { borderRadius: number }).borderRadius = Math.min(el.roundness.value ?? 32, maxR);
  }
  const node = rc.rectangle(ox + el.x, oy + el.y, el.width, el.height, opts);
  withTransform(svgEl, node, el, ox, oy);
}

function renderEllipse(rc: RC, svgEl: SVGSVGElement, el: ExcalidrawElement, ox: number, oy: number) {
  const cx = ox + el.x + el.width / 2;
  const cy = oy + el.y + el.height / 2;
  const node = rc.ellipse(cx, cy, el.width, el.height, roughOpts(el));
  withTransform(svgEl, node, el, ox, oy);
}

function renderDiamond(rc: RC, svgEl: SVGSVGElement, el: ExcalidrawElement, ox: number, oy: number) {
  const x = ox + el.x, y = oy + el.y, w = el.width, h = el.height;
  const pts: [number, number][] = [
    [x + w / 2, y],
    [x + w, y + h / 2],
    [x + w / 2, y + h],
    [x, y + h / 2],
  ];
  const node = rc.polygon(pts, roughOpts(el));
  withTransform(svgEl, node, el, ox, oy);
}

function renderLinear(rc: RC, svgEl: SVGSVGElement, el: ExcalidrawElement, ox: number, oy: number) {
  const pts: [number, number][] = (el.points ?? [[0, 0], [el.width ?? 100, 0]])
    .map(([px, py]) => [ox + el.x + px, oy + el.y + py]);

  const opts = roughOpts(el);
  opts.fill = 'none'; // lines never fill

  const node = pts.length === 2
    ? rc.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1], opts)
    : rc.linearPath(pts, opts);

  const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  const opacity = (el.opacity ?? 100) / 100;
  if (opacity < 1) g.setAttribute('opacity', String(opacity));
  g.appendChild(node);

  const strokeColor = el.strokeColor || '#1e1e1e';
  if (el.type === 'arrow') {
    const endHead = el.endArrowhead ?? 'arrow';
    if (endHead && endHead !== 'none') addArrowhead(g, pts, 'end', strokeColor, el.strokeWidth ?? 2);
    if (el.startArrowhead && el.startArrowhead !== 'none') {
      addArrowhead(g, pts, 'start', strokeColor, el.strokeWidth ?? 2);
    }
  }

  svgEl.appendChild(g);
}

function addArrowhead(
  parent: SVGGElement,
  pts: [number, number][],
  side: 'start' | 'end',
  color: string,
  strokeWidth: number,
) {
  const SIZE = 10 + strokeWidth;
  const tip = side === 'end' ? pts[pts.length - 1] : pts[0];
  const base = side === 'end' ? (pts[pts.length - 2] ?? pts[0]) : (pts[1] ?? pts[pts.length - 1]);

  const dx = tip[0] - base[0];
  const dy = tip[1] - base[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;

  const ux = dx / len, uy = dy / len;
  const left: [number, number]  = [tip[0] - SIZE * ux + SIZE * 0.4 * uy, tip[1] - SIZE * uy - SIZE * 0.4 * ux];
  const right: [number, number] = [tip[0] - SIZE * ux - SIZE * 0.4 * uy, tip[1] - SIZE * uy + SIZE * 0.4 * ux];

  const poly = document.createElementNS(SVG_NS, 'polygon');
  poly.setAttribute('points', `${tip[0]},${tip[1]} ${left[0]},${left[1]} ${right[0]},${right[1]}`);
  poly.setAttribute('fill', color);
  poly.setAttribute('stroke', color);
  poly.setAttribute('stroke-linejoin', 'round');
  parent.appendChild(poly);
}

function renderText(svgEl: SVGSVGElement, el: ExcalidrawElement, ox: number, oy: number) {
  if (!el.text?.trim()) return;

  const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  const opacity = (el.opacity ?? 100) / 100;
  if (opacity < 1) g.setAttribute('opacity', String(opacity));

  if (el.angle) {
    const cx = ox + el.x + (el.width || 0) / 2;
    const cy = oy + el.y + (el.height || 0) / 2;
    const deg = (el.angle * 180) / Math.PI;
    g.setAttribute('transform', `rotate(${deg.toFixed(3)}, ${cx.toFixed(2)}, ${cy.toFixed(2)})`);
  }

  const fontSize = el.fontSize ?? 20;
  const ff = fontFamily(el.fontFamily);
  const color = el.strokeColor || '#1e1e1e';
  const textAlign = el.textAlign || 'left';
  const lines = el.text.split('\n');
  const lineHeight = fontSize * 1.25;

  // x anchor
  let anchorX = ox + el.x;
  let textAnchor = 'start';
  if (textAlign === 'center') {
    anchorX = ox + el.x + (el.width || 0) / 2;
    textAnchor = 'middle';
  } else if (textAlign === 'right') {
    anchorX = ox + el.x + (el.width || 0);
    textAnchor = 'end';
  }

  // y start (default: top)
  let startY = oy + el.y + fontSize;
  const totalH = lines.length * lineHeight;
  if (el.verticalAlign === 'middle') {
    startY = oy + el.y + (el.height || 0) / 2 - totalH / 2 + fontSize;
  } else if (el.verticalAlign === 'bottom') {
    startY = oy + el.y + (el.height || 0) - (lines.length - 1) * lineHeight;
  }

  for (let i = 0; i < lines.length; i++) {
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(anchorX));
    t.setAttribute('y', String(startY + i * lineHeight));
    t.setAttribute('font-family', ff);
    t.setAttribute('font-size', String(fontSize));
    t.setAttribute('fill', color);
    t.setAttribute('text-anchor', textAnchor);
    t.textContent = lines[i];
    g.appendChild(t);
  }

  svgEl.appendChild(g);
}

// ── Main export ────────────────────────────────────────────────────────────

export async function renderExcalidraw(
  jsonString: string,
  opts: { embedFont?: boolean } = {},
): Promise<{ svg: string; error: string | null }> {
  try {
    const raw = JSON.parse(jsonString) as ExcalidrawData | ExcalidrawElement[];
    const data: ExcalidrawData = Array.isArray(raw)
      ? { elements: raw }
      : raw;

    const elements = (data.elements ?? []).filter((el) => !el.isDeleted);
    if (elements.length === 0) return { svg: '', error: null };

    const { minX, minY, maxX, maxY } = getBounds(elements);
    const w = maxX - minX + PADDING * 2;
    const h = maxY - minY + PADDING * 2;
    const ox = -minX + PADDING;
    const oy = -minY + PADDING;

    // Build SVG
    const svgEl = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svgEl.setAttribute('xmlns', SVG_NS);
    svgEl.setAttribute('width', String(w));
    svgEl.setAttribute('height', String(h));
    svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);

    // Font style
    const styleEl = document.createElementNS(SVG_NS, 'style');
    if (opts.embedFont) {
      const b64 = await loadCaveatBase64();
      if (b64) {
        styleEl.textContent =
          `@font-face{font-family:'Caveat';src:url('data:font/woff2;base64,${b64}') format('woff2');font-weight:normal;font-style:normal;}`;
      } else {
        styleEl.textContent = `text{font-family:'Caveat',cursive;}`;
      }
    } else {
      styleEl.textContent = `text{font-family:'Caveat',cursive;}`;
    }
    svgEl.appendChild(styleEl);

    // Background
    const bgColor = data.appState?.viewBackgroundColor ?? '#ffffff';
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
    bg.setAttribute('fill', bgColor);
    svgEl.appendChild(bg);

    const rc = rough.svg(svgEl);

    // Tag each element's nodes with its index in the source `elements` array,
    // so clicks in the preview can be mapped back to the JSON (see sourceMap.ts)
    const allElements = data.elements ?? [];
    for (const el of elements) {
      const firstNew = svgEl.childNodes.length;
      switch (el.type) {
        case 'rectangle': renderRectangle(rc, svgEl, el, ox, oy); break;
        case 'ellipse':   renderEllipse(rc, svgEl, el, ox, oy);   break;
        case 'diamond':   renderDiamond(rc, svgEl, el, ox, oy);   break;
        case 'line':
        case 'arrow':     renderLinear(rc, svgEl, el, ox, oy);    break;
        case 'text':      renderText(svgEl, el, ox, oy);          break;
        // freedraw / image / frame: silently skip for now
      }
      const index = String(allElements.indexOf(el));
      for (let i = firstNew; i < svgEl.childNodes.length; i++) {
        (svgEl.childNodes[i] as Element).setAttribute('data-el-index', index);
      }
    }

    const svg = new XMLSerializer().serializeToString(svgEl);
    return { svg, error: null };
  } catch (err) {
    return {
      svg: '',
      error: err instanceof Error ? err.message : 'Failed to parse Excalidraw JSON',
    };
  }
}
