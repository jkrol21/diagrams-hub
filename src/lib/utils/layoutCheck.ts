/**
 * Finds layout defects in a rendered Mermaid SVG that is attached to the
 * document: overlapping nodes, edges drawn through unrelated nodes, labels
 * covered by nodes, other labels or other edges, groups overlapping each other
 * and nodes sticking out of groups. Mermaid renders all of these without
 * complaint (architecture-beta's force layout is the usual culprit), so
 * without this check an agent can't tell a broken diagram from a good one.
 *
 * Geometry is measured in screen space (getBoundingClientRect, so transforms
 * and the preview zoom don't matter) and thresholds are given in SVG units.
 * The pure geometry helpers are exported for tests.
 */
import type { Diagnostic } from './diagnostics';
import { findLabel, locateMermaidElement } from './sourceMap';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Overlap smaller than this (SVG units, both directions) is a touching border, not a defect */
const MIN_OVERLAP = 3;
/** How far from a node an edge may start/end and still count as attached to it */
const ENDPOINT_SLACK = 12;
/** Distance between samples along an edge */
const SAMPLE_STEP = 4;
/** More than this would bury the useful messages */
const MAX_ISSUES = 25;
/** Longer side / shorter side beyond which a diagram is unreadable when fitted to a slide */
const MAX_ASPECT = 5;

export function intersection(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/** Overlap that is clearly visible (not just touching borders) */
export function overlaps(a: Box, b: Box, min = MIN_OVERLAP): boolean {
  const i = intersection(a, b);
  return !!i && i.w >= min && i.h >= min;
}

export function contains(outer: Box, inner: Box, slack = 1): boolean {
  return inner.x >= outer.x - slack && inner.y >= outer.y - slack &&
    inner.x + inner.w <= outer.x + outer.w + slack && inner.y + inner.h <= outer.y + outer.h + slack;
}

export function inset(b: Box, d: number): Box {
  return { x: b.x + d, y: b.y + d, w: b.w - 2 * d, h: b.h - 2 * d };
}

export function containsPoint(b: Box, p: Point): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

/** Whether a polyline (sampled edge) passes through the box */
export function crosses(points: Point[], b: Box): boolean {
  return b.w > 0 && b.h > 0 && points.some((p) => containsPoint(b, p));
}

/**
 * architecture-beta: the group each service and group is declared `in`
 * (Mermaid places services freely, so one can land inside a foreign group)
 */
export function architectureParents(code: string): Map<string, string> {
  const parents = new Map<string, string>();
  for (const m of code.matchAll(/^\s*(?:service|group|junction)\s+([\w-]+)\b.*?\s+in\s+([\w-]+)\s*$/gm)) {
    parents.set(m[1], m[2]);
  }
  return parents;
}

interface Item {
  el: Element;
  box: Box;
  name: string;
}

interface Edge {
  el: SVGGeometryElement;
  points: Point[];
  /** Id that labels refer to (flowchart `data-id`), without the diagram's id prefix */
  id: string;
}

function textOf(el: Element): string {
  // HTML labels: innerText keeps the line breaks (<br>) that textContent drops
  const html = el.querySelector('foreignObject div, foreignObject span') as HTMLElement | null;
  const text = ((html?.innerText || el.textContent) ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 40 ? text.slice(0, 39) + '…' : text;
}

export function checkLayout(svg: SVGSVGElement, code: string): Diagnostic[] {
  const svgRect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  // Screen pixels per SVG unit
  const k = vb && vb.width && svgRect.width ? svgRect.width / vb.width : 1;
  if (!svgRect.width || !svgRect.height) return [];

  const boxOf = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const item = (el: Element, name = textOf(el)): Item | null => {
    const box = boxOf(el);
    return box.w > 0 && box.h > 0 ? { el, box, name } : null;
  };
  const present = <T>(x: T | null): x is T => x !== null;
  const min = MIN_OVERLAP * k;

  const nodes = [...svg.querySelectorAll('g.node, g.icon-shape, g.image-shape, .architecture-service')]
    .filter((el) => !el.parentElement?.closest('g.node, g.icon-shape, g.image-shape')) // nested parts of a node
    .map((el) => item(el)).filter(present);

  const groups = [...svg.querySelectorAll('g.cluster, rect[id^="group-"]')].map((el) => {
    // architecture-beta: the title (with its icon) is the element after the rect
    const titleEl = el.tagName.toLowerCase() === 'rect' ? el.nextElementSibling : el.querySelector('.cluster-label');
    const title = titleEl ? item(titleEl) : null;
    const group = item(el, title?.name || el.id);
    return group ? { ...group, title } : null;
  }).filter(present);

  const edges: Edge[] = [...svg.querySelectorAll<SVGGeometryElement>(
    'path.flowchart-link, path.transition, path.relation, path.relationshipLine, .architecture-edges path.edge'
  )].map((el) => {
    const toScreen = el.getScreenCTM();
    let length = 0;
    try {
      length = el.getTotalLength();
    } catch {
      return null;
    }
    if (!toScreen || !length) return null;
    const points: Point[] = [];
    const steps = Math.max(2, Math.ceil(length / SAMPLE_STEP));
    for (let i = 0; i <= steps; i++) {
      const p = el.getPointAtLength((length * i) / steps);
      const s = new DOMPoint(p.x, p.y).matrixTransform(toScreen);
      points.push({ x: s.x, y: s.y });
    }
    const id = svg.id && el.id.startsWith(svg.id + '-') ? el.id.slice(svg.id.length + 1) : el.id;
    return { el, points, id };
  }).filter(present);

  // Edge labels and the edge each belongs to
  const labels = [
    ...[...svg.querySelectorAll('g.edgeLabel')].map((el) => {
      const ref = el.querySelector('[data-id]')?.getAttribute('data-id');
      return { el, owner: ref ? edges.find((e) => e.id === ref) ?? null : null };
    }),
    ...[...svg.querySelectorAll('.architecture-edges > g')].flatMap((g) => {
      const owner = edges.find((e) => e.el.parentElement === g) ?? null;
      return [...g.querySelectorAll(':scope > g')].filter((l) => l.querySelector('text')).map((el) => ({ el, owner }));
    }),
  ].map(({ el, owner }) => {
    const it = item(el);
    return it && it.name ? { ...it, owner } : null;
  }).filter(present);

  const issues: Array<{ message: string; el: Element }> = [];
  const report = (message: string, el: Element) => {
    if (!issues.some((i) => i.message === message)) issues.push({ message, el });
  };
  const q = (s: string) => `"${s}"`;

  // Nodes on top of each other
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (overlaps(nodes[i].box, nodes[j].box, min)) {
        report(`Nodes ${q(nodes[i].name)} and ${q(nodes[j].name)} overlap`, nodes[j].el);
      }
    }
  }

  // architecture-beta: a service drawn inside a group it isn't declared in
  const parents = architectureParents(code);
  const idOf = (el: Element, prefix: string) => el.id.replace(new RegExp(`^(${svg.id}-)?${prefix}-`), '');
  const ancestors = (id: string) => {
    const seen: string[] = [];
    for (let p = parents.get(id); p && !seen.includes(p); p = parents.get(p)) seen.push(p);
    return seen;
  };
  for (const n of nodes.filter((n) => n.el.matches('.architecture-service'))) {
    const own = ancestors(idOf(n.el, 'service'));
    for (const g of groups.filter((g) => g.el.id && contains(g.box, n.box, k))) {
      if (!own.includes(idOf(g.el, 'group'))) {
        report(`Node ${q(n.name)} is drawn inside group ${q(g.name)} but doesn't belong to it`, n.el);
      }
    }
  }

  // Groups: partly overlapping each other, nodes sticking out, titles covered
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    for (let j = i + 1; j < groups.length; j++) {
      const h = groups[j];
      if (overlaps(g.box, h.box, min) && !contains(g.box, h.box, k) && !contains(h.box, g.box, k)) {
        report(`Groups ${q(g.name)} and ${q(h.name)} overlap`, h.el);
      }
    }
    for (const n of nodes) {
      if (overlaps(g.box, n.box, min) && !contains(g.box, n.box, k)) {
        report(`Node ${q(n.name)} sticks out of group ${q(g.name)}`, n.el);
      }
      if (g.title && overlaps(g.title.box, n.box, min)) {
        report(`Group title ${q(g.name)} is covered by node ${q(n.name)}`, g.el);
      }
    }
    for (const l of labels) {
      if (g.title && overlaps(g.title.box, l.box, min)) {
        report(`Group title ${q(g.name)} is covered by edge label ${q(l.name)}`, g.el);
      }
    }
  }

  // Which nodes an edge is attached to: those its ends touch
  const endpoints = (e: Edge) => {
    const ends = [e.points[0], e.points[e.points.length - 1]];
    return nodes.filter((n) => ends.some((p) => containsPoint(inset(n.box, -ENDPOINT_SLACK * k), p)));
  };
  const edgeName = (ends: Item[]) =>
    ends.length === 2 ? `Edge ${q(ends[0].name)} – ${q(ends[1].name)}` : ends.length === 1 ? `An edge of ${q(ends[0].name)}` : 'An edge';

  for (const e of edges) {
    const ends = endpoints(e);
    for (const n of nodes) {
      if (!ends.includes(n) && crosses(e.points, inset(n.box, MIN_OVERLAP * k))) {
        report(`${edgeName(ends)} runs through node ${q(n.name)}`, n.el);
      }
    }
  }

  // Edge labels: on nodes, on each other, crossed by a different edge
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    for (const n of nodes) {
      if (overlaps(l.box, n.box, min)) report(`Edge label ${q(l.name)} overlaps node ${q(n.name)}`, l.el);
    }
    for (let j = i + 1; j < labels.length; j++) {
      if (overlaps(l.box, labels[j].box, min)) {
        report(`Edge labels ${q(l.name)} and ${q(labels[j].name)} overlap`, labels[j].el);
      }
    }
    if (!l.owner) continue; // unknown owner: every edge near it may be its own
    for (const e of edges) {
      if (e !== l.owner && crosses(e.points, inset(l.box, MIN_OVERLAP * k))) {
        report(`Edge label ${q(l.name)} is crossed by ${edgeName(endpoints(e)).replace(/^An/, 'an').replace(/^Edge/, 'edge')}`, l.el);
      }
    }
  }

  const [long, short] = [Math.max(vb.width, vb.height), Math.min(vb.width, vb.height)];
  // Only for node diagrams: a gantt chart or a long sequence is wide/tall by nature
  if (nodes.length > 1 && short > 0 && long / short > MAX_ASPECT) {
    report(`The diagram is ${Math.round(vb.width)}x${Math.round(vb.height)} — too ${vb.width > vb.height ? 'wide' : 'tall'} to read ` +
      'when fitted to a page; rearrange it (direction, groups) or split it', svg);
  }

  const lineOf = (el: Element): number | undefined => {
    if (el === svg) return undefined;
    const range = locateMermaidElement(code, el, svg)?.range ?? findLabel(code, textOf(el));
    return range ? code.slice(0, range.from).split('\n').length : undefined;
  };
  const shown = issues.slice(0, MAX_ISSUES).map(({ message, el }) => ({
    message: `Layout: ${message}.`,
    line: lineOf(el),
    kind: 'layout' as const,
  }));
  if (issues.length > MAX_ISSUES) {
    shown.push({ message: `Layout: ${issues.length - MAX_ISSUES} more layout problems not listed.`, line: undefined, kind: 'layout' });
  }
  return shown;
}
