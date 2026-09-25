/**
 * Applies a look's per-group hues to a rendered Mermaid SVG that is attached
 * to the document (it needs layout to find which group a node sits in).
 *
 * Mermaid theme variables give every node the palette's first hue; this pass
 * gives each top-level group (subgraph, namespace, architecture group) the
 * next palette hue, colors the nodes inside it to match, and draws
 * architecture-beta icons on colored tiles. Nested groups inherit their
 * parent's hue. Nodes the user styled explicitly (classDef/style) are left
 * alone. Safe to call repeatedly on the same SVG.
 */
import { paletteRoles, type Look, type Roles } from './looks';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TILE_SIZE = 72; // matches `architecture.iconSize` in mermaidConfig.ts
const ICON_SCALE = 0.62;
const SLATE_50 = '#f8fafc';
const SLATE_700 = '#334155';
const SLATE_800 = '#1e293b';

interface Box {
  el: Element;
  rect: DOMRect;
  hue: number;
  parent: Box | null;
}

function set(el: Element, prop: string, value: string | number) {
  (el as SVGElement | HTMLElement).style.setProperty(prop, String(value), 'important');
}

function contains(outer: DOMRect, inner: DOMRect): boolean {
  return inner.left >= outer.left - 1 && inner.right <= outer.right + 1 &&
    inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1 &&
    outer.width * outer.height > inner.width * inner.height;
}

function containsPoint(r: DOMRect, x: number, y: number): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/** Groups in document order; top-level ones get consecutive hues, nested ones inherit */
function collectGroups(svg: SVGSVGElement): Box[] {
  const boxes: Box[] = [...svg.querySelectorAll('g.cluster, rect[id^="group-"]')]
    .map((el) => ({ el, rect: el.getBoundingClientRect(), hue: 0, parent: null as Box | null }))
    .filter((b) => b.rect.width > 0 && b.rect.height > 0);

  for (const box of boxes) {
    let parent: Box | null = null;
    for (const other of boxes) {
      if (other !== box && contains(other.rect, box.rect) &&
          (!parent || parent.rect.width * parent.rect.height > other.rect.width * other.rect.height)) {
        parent = other;
      }
    }
    box.parent = parent;
  }

  let next = 0;
  for (const box of boxes) {
    let root = box;
    while (root.parent) root = root.parent;
    if (root === box) box.hue = next++;
  }
  for (const box of boxes) {
    let root = box;
    while (root.parent) root = root.parent;
    box.hue = root.hue;
  }
  return boxes;
}

/** Innermost group containing the center of `el` */
function groupOf(el: Element, groups: Box[]): Box | null {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  let best: Box | null = null;
  for (const g of groups) {
    if (containsPoint(g.rect, x, y) && (!best || g.rect.width * g.rect.height < best.rect.width * best.rect.height)) {
      best = g;
    }
  }
  return best;
}

function styleGroup(group: Box, r: Roles) {
  const shapes = group.el.tagName.toLowerCase() === 'rect'
    ? [group.el]
    : [...group.el.querySelectorAll(':scope > rect, :scope > path, :scope > polygon')];
  for (const shape of shapes) {
    set(shape, 'fill', r.groupFill);
    set(shape, 'stroke', r.groupStroke);
    set(shape, 'stroke-width', 1.5);
    set(shape, 'stroke-dasharray', r.groupDash);
    if (shape.tagName.toLowerCase() === 'rect') {
      shape.setAttribute('rx', '12');
      shape.setAttribute('ry', '12');
    }
  }
  // Group titles (flowchart/class: inside the cluster; architecture: sibling after the rect)
  const labelRoot = group.el.tagName.toLowerCase() === 'rect' ? group.el.nextElementSibling : group.el;
  if (labelRoot) {
    for (const t of labelRoot.querySelectorAll('.cluster-label text, .cluster-label span, .cluster-label p, text, tspan')) {
      set(t, 'fill', r.groupText);
      set(t, 'color', r.groupText);
      set(t, 'font-weight', 600);
    }
    for (const icon of labelRoot.querySelectorAll('svg')) set(icon, 'color', r.groupText);
  }
}

/** A node styled by the author (classDef/style → inline fill) keeps its colors */
function isAuthorStyled(node: Element): boolean {
  if (node.hasAttribute('data-dh-styled')) return false;
  return [...node.querySelectorAll('rect, path, polygon, circle, ellipse')]
    .some((s) => /fill\s*:/.test(s.getAttribute('style') ?? ''));
}

function styleNode(node: Element, r: Roles) {
  node.setAttribute('data-dh-styled', '');
  const label = node.querySelector('.label, foreignObject');
  for (const shape of node.querySelectorAll('rect, path, polygon, circle, ellipse')) {
    if (label?.contains(shape) || shape.closest('.divider')) {
      set(shape, 'stroke', r.stroke);
      continue;
    }
    // ER attribute rows stay light (only the entity header carries the style's fill)
    const row = shape.closest('.row-rect-odd, .row-rect-even');
    set(shape, 'fill', row ? (row.classList.contains('row-rect-odd') ? '#ffffff' : SLATE_50) : r.fill);
    set(shape, 'stroke', r.stroke);
    set(shape, 'stroke-width', r.strokeWidth);
  }
  roundCorners(node);
  for (const t of node.querySelectorAll('text, tspan')) {
    set(t, 'fill', t.closest('[class*="attribute-"]') ? SLATE_800 : r.text);
  }
  for (const t of node.querySelectorAll('span, p, div')) {
    set(t, 'color', t.closest('[class*="attribute-"]') ? SLATE_800 : r.text);
  }
}

/** Square-cornered boxes get a modest radius (rounded/stadium shapes already have one) */
function roundCorners(node: Element) {
  for (const rect of node.querySelectorAll(':scope > rect, :scope > g > rect')) {
    if (Number(rect.getAttribute('rx') ?? 0) === 0 && Number(rect.getAttribute('height')) > 20) {
      rect.setAttribute('rx', '6');
      rect.setAttribute('ry', '6');
    }
  }
}

/** architecture-beta: put the icon on a rounded, colored tile */
function styleService(service: Element, r: Roles) {
  service.querySelector(':scope > [data-dh-tile]')?.remove();
  const iconGroup = [...service.children].find((c) => c.querySelector('svg, image') && !c.querySelector('text'));
  if (!iconGroup) return;

  const tile = document.createElementNS(SVG_NS, 'rect');
  tile.setAttribute('data-dh-tile', '');
  tile.setAttribute('width', String(TILE_SIZE));
  tile.setAttribute('height', String(TILE_SIZE));
  tile.setAttribute('rx', '16');
  tile.setAttribute('ry', '16');
  set(tile, 'fill', r.tileFill);
  set(tile, 'stroke', r.tileStroke);
  set(tile, 'stroke-width', r.strokeWidth);
  service.insertBefore(tile, iconGroup);

  const offset = (TILE_SIZE * (1 - ICON_SCALE)) / 2;
  if (!iconGroup.hasAttribute('data-dh-original-transform')) {
    iconGroup.setAttribute('data-dh-original-transform', iconGroup.getAttribute('transform') ?? '');
  }
  const original = iconGroup.getAttribute('data-dh-original-transform');
  iconGroup.setAttribute('transform', `${original} translate(${offset}, ${offset}) scale(${ICON_SCALE})`.trim());
  set(iconGroup, 'color', r.icon);
  // Some icon packs hard-code black instead of currentColor
  for (const el of iconGroup.querySelectorAll('[stroke="#000"], [stroke="black"], [fill="#000"], [fill="black"]')) {
    if (el.getAttribute('stroke')) el.setAttribute('stroke', 'currentColor');
    if (el.getAttribute('fill')) el.setAttribute('fill', 'currentColor');
  }
}

export function applyLook(svg: SVGSVGElement, look: Look): void {
  const groups = collectGroups(svg);
  const services = [...svg.querySelectorAll('.architecture-service')]
    .map((el) => ({ el, group: groupOf(el.querySelector('svg, image') ?? el, groups) }));
  // Mindmap nodes are colored per branch through the palette's section colors (cScale*)
  const isMindmap = svg.getAttribute('aria-roledescription') === 'mindmap';
  const nodes = [...svg.querySelectorAll(isMindmap ? ':not(*)' : 'g.node')]
    .filter((el) => !/(^|[-_])(root_)?(start|end)([-_]|$)/.test(el.id) && !isAuthorStyled(el))
    .map((el) => ({ el, group: groupOf(el, groups) }));

  // Ungrouped nodes keep the main hue; if there are any, groups start at the
  // next hue so they stand out from them
  const offset = [...services, ...nodes].some((n) => !n.group) ? 1 : 0;
  const hueOf = (group: Box | null) => (group ? group.hue + offset : 0);

  for (const group of groups) styleGroup(group, paletteRoles(look, hueOf(group)));
  // architecture-beta draws groups after (above) services and edges; with a fill they'd cover them
  for (const layer of svg.querySelectorAll('.architecture-groups')) {
    layer.parentElement?.insertBefore(layer, layer.parentElement.firstChild);
  }
  for (const { el, group } of services) styleService(el, paletteRoles(look, hueOf(group)));
  for (const { el, group } of nodes) styleNode(el, paletteRoles(look, hueOf(group)));
  // Mindmap root: Mermaid derives its colors separately (and unreadably in some styles)
  for (const root of svg.querySelectorAll('g.node.section-root')) styleNode(root, paletteRoles(look, 0));
  if (isMindmap && look.style === 'solid') {
    for (const t of svg.querySelectorAll('g.mindmap-node:not(.section-root) :is(span, p, div)')) set(t, 'color', '#ffffff');
    for (const t of svg.querySelectorAll('g.mindmap-node:not(.section-root) :is(text, tspan)')) set(t, 'fill', '#ffffff');
  }

  // Edge labels sit on the (white) background, whatever color the nodes' text has
  for (const t of svg.querySelectorAll('.edgeLabel text, .edgeLabel tspan')) set(t, 'fill', SLATE_700);
  for (const t of svg.querySelectorAll('.edgeLabel span, .edgeLabel p, .edgeLabel div')) set(t, 'color', SLATE_700);
  for (const bg of svg.querySelectorAll('.edgeLabel rect, .edgeLabel .labelBkg, span.edgeLabel')) {
    if (bg.tagName.toLowerCase() === 'rect') set(bg, 'fill', '#ffffff');
    else set(bg, 'background-color', '#ffffff');
  }
}
