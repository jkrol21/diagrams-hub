/**
 * Maps clicked elements in the rendered preview back to their definition in
 * the source code, so the editor can highlight the line to change.
 *
 * Mermaid: resolved via the element ids Mermaid writes into the SVG
 * (`service-<id>`, `group-<id>`, `node-<id>`, `flowchart-<id>-0`, edge ids like
 * `L_<from>_<to>_0`), falling back to the clicked label text.
 * Excalidraw: the renderer tags each element with `data-el-index`, which is
 * mapped to the element's object in the JSON text.
 */

export interface SourceRange {
  /** Start offset of the primary match (selected in the editor) */
  from: number;
  /** End offset of the primary match */
  to: number;
  /** Offsets of the full block to highlight (definition line, JSON object) */
  blockFrom: number;
  blockTo: number;
}

/**
 * Keywords and id prefixes that never name a user element. Single letters
 * (edge sides L/R/T/B, the edge prefix L) are deliberately not listed: they
 * are common node names in flowcharts.
 */
const RESERVED = new Set([
  'node', 'service', 'group', 'junction', 'edge', 'flowchart', 'graph',
  'architecture', 'beta', 'in', 'end', 'subgraph', 'participant', 'actor',
  'class', 'state', 'style', 'classDef', 'linkStyle', 'click', 'TB', 'TD',
  'BT', 'LR', 'RL',
]);

const IDENT_RE = /[A-Za-z_][\w-]*/g;
const DEFINITION_KEYWORDS = /\b(service|group|junction|participant|actor|class|state|subgraph)\s+$/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Regex for `ident` as a whole token (Mermaid ids may contain `-`) */
function tokenRegExp(ident: string, flags = 'g'): RegExp {
  return new RegExp(`(?<![\\w-])${escapeRegExp(ident)}(?![\\w-])`, flags);
}

function lineBounds(code: string, offset: number): { start: number; end: number } {
  const start = code.lastIndexOf('\n', offset - 1) + 1;
  const nl = code.indexOf('\n', offset);
  return { start, end: nl === -1 ? code.length : nl };
}

function isCommentLine(code: string, offset: number): boolean {
  const { start } = lineBounds(code, offset);
  return code.slice(start, offset).trimStart().startsWith('%%');
}

/** All distinct identifiers used in the source (candidates for element ids) */
export function codeIdentifiers(code: string): string[] {
  const idents = new Set<string>();
  for (const m of code.matchAll(IDENT_RE)) {
    if (!RESERVED.has(m[0]) && !isCommentLine(code, m.index!)) idents.add(m[0]);
  }
  return [...idents];
}

function rangeAt(code: string, from: number, to: number): SourceRange {
  const { start } = lineBounds(code, from);
  const { end } = lineBounds(code, to);
  return { from, to, blockFrom: start, blockTo: end };
}

/**
 * Find where `ident` is defined. Prefers `service ident(`, `ident[Label]`
 * and similar definition forms over plain references (e.g. in edges).
 */
export function findDefinition(code: string, ident: string): SourceRange | null {
  let firstRef: number | null = null;

  for (const m of code.matchAll(tokenRegExp(ident))) {
    const at = m.index!;
    if (isCommentLine(code, at)) continue;
    firstRef ??= at;

    const before = code.slice(lineBounds(code, at).start, at);
    const after = code.charAt(at + ident.length);
    if (DEFINITION_KEYWORDS.test(before) || (after !== '' && '[({>'.includes(after))) {
      return rangeAt(code, at, at + ident.length);
    }
  }

  return firstRef === null ? null : rangeAt(code, firstRef, firstRef + ident.length);
}

/** Find the line connecting `from` and `to` (either direction) */
export function findEdge(code: string, from: string, to: string): SourceRange | null {
  const a = `(?<![\\w-])${escapeRegExp(from)}(?![\\w-])`;
  const b = `(?<![\\w-])${escapeRegExp(to)}(?![\\w-])`;
  const re = new RegExp(`^[^\\S\\n]*(?!%%).*?(${a}.*?${b}|${b}.*?${a}).*$`, 'm');
  const m = re.exec(code);
  if (!m) return null;
  const from0 = m.index + m[0].length - m[0].trimStart().length;
  return rangeAt(code, from0, m.index + m[0].length);
}

/** Find a label's text inside `[...]`, `(...)`, `{...}` or quotes */
export function findLabel(code: string, label: string): SourceRange | null {
  const chars = [...label.replace(/\s+/g, '')];
  if (!chars.length) return null;
  // Rendered text may have lost or gained whitespace where Mermaid wrapped it
  const text = chars.map(escapeRegExp).join('\\s*');
  const re = new RegExp(`[\\[({"'|]\\s*(${text})\\s*[\\])}"'|]`, 'g');
  for (const m of code.matchAll(re)) {
    const at = m.index! + m[0].indexOf(m[1]);
    if (!isCommentLine(code, at)) return rangeAt(code, at, at + m[1].length);
  }
  // Plain occurrence (e.g. sequence diagram messages)
  const plain = new RegExp(text).exec(code);
  return plain ? rangeAt(code, plain.index, plain.index + plain[0].length) : null;
}

/** Longest code identifier that appears as a delimited segment of `elementId` */
function matchIdentifier(elementId: string, idents: string[]): string | null {
  let best: string | null = null;
  for (const ident of idents) {
    if (best && ident.length <= best.length) continue;
    const re = new RegExp(`(^|[-_])${escapeRegExp(ident)}([-_]|$)`);
    if (re.test(elementId)) best = ident;
  }
  return best;
}

/** Resolve an edge id like `L_a_b_0` / `L-a-b-0` to its endpoints */
function matchEdge(elementId: string, idents: string[]): [string, string] | null {
  const m = /^L[-_](.+)[-_]\d+$/.exec(elementId);
  if (!m) return null;
  const body = m[1];
  for (const a of idents) {
    for (const sep of ['_', '-']) {
      if (!body.startsWith(a + sep)) continue;
      const b = body.slice(a.length + 1);
      if (idents.includes(b)) return [a, b];
    }
  }
  return null;
}

/**
 * Locate the source of a clicked Mermaid SVG element.
 * Returns the range and the SVG element that was resolved (for highlighting).
 */
export function locateMermaidElement(
  code: string,
  target: Element,
  svgRoot: Element,
): { range: SourceRange; element: Element } | null {
  const idents = codeIdentifiers(code);
  const rootId = svgRoot.id;
  let labelText: string | null = null;
  let labelEl: Element | null = null;

  for (let el: Element | null = target; el && el !== svgRoot.parentElement; el = el.parentElement) {
    const tag = el.tagName.toLowerCase();
    // Whole <text>, not a single <tspan> (Mermaid wraps words in separate tspans)
    if (!labelText && (tag === 'text' || el.classList.contains('nodeLabel'))) {
      labelText = el.textContent?.trim() || null;
      labelEl = el;
    }
    if (el === svgRoot) break;

    let id = el.id;
    if (!id) continue;
    if (rootId && id.startsWith(rootId + '-')) id = id.slice(rootId.length + 1);

    const edge = matchEdge(id, idents);
    if (edge) {
      const range = findEdge(code, edge[0], edge[1]);
      if (range) return { range, element: el };
    }

    const ident = matchIdentifier(id, idents);
    if (ident) {
      const range = findDefinition(code, ident);
      if (range) return { range, element: el };
    }
  }

  if (labelText) {
    const range = findLabel(code, labelText);
    if (range) return { range, element: labelEl! };
  }
  return null;
}

/**
 * Offsets of the top-level objects in an Excalidraw document's `elements`
 * array (or of a bare top-level array). Minimal scanner, tolerant of
 * formatting; returns [] for anything it can't follow.
 */
export function excalidrawElementRanges(code: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  let depth = 0;
  let arrayDepth = -1; // depth at which the elements array's items live
  let objStart = -1;
  let lastKey: string | null = null;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < code.length && code[j] !== '"') j += code[j] === '\\' ? 2 : 1;
      const str = code.slice(i + 1, j);
      const next = code.slice(j + 1).match(/^\s*:/);
      if (next && depth === 1) lastKey = str;
      i = j;
      continue;
    }
    if (ch === '[' || ch === '{') {
      if (ch === '[' && arrayDepth === -1 && (depth === 0 || (depth === 1 && lastKey === 'elements'))) {
        arrayDepth = depth + 1;
      } else if (ch === '{' && depth === arrayDepth) {
        objStart = i;
      }
      depth++;
    } else if (ch === ']' || ch === '}') {
      depth--;
      if (ch === '}' && depth === arrayDepth && objStart !== -1) {
        ranges.push({ from: objStart, to: i + 1 });
        objStart = -1;
      } else if (ch === ']' && depth === arrayDepth - 1) {
        break;
      }
    }
  }
  return ranges;
}

/** Locate the JSON object of the Excalidraw element with the given array index */
export function locateExcalidrawElement(code: string, index: number): SourceRange | null {
  const r = excalidrawElementRanges(code)[index];
  if (!r) return null;
  // Select the `"type": "..."` entry if present, otherwise the object start
  const typeMatch = /"type"\s*:\s*"[^"]*"/.exec(code.slice(r.from, r.to));
  const from = typeMatch ? r.from + typeMatch.index : r.from;
  const to = typeMatch ? from + typeMatch[0].length : r.from + 1;
  return { from, to, blockFrom: lineBounds(code, r.from).start, blockTo: lineBounds(code, r.to).end };
}
