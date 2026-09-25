/**
 * Turns renderer errors into actionable diagnostics (line/column + source
 * excerpt) and catches mistakes Mermaid renders silently, such as unknown
 * icon names (drawn as a "?" placeholder instead of failing).
 */

export interface Diagnostic {
  message: string;
  /** 1-based line in the source, if known */
  line?: number;
  /** 1-based column in the source, if known */
  column?: number;
  /** Numbered source lines around `line` with a caret (see codeExcerpt) */
  excerpt?: string;
}

/** Icons Mermaid's architecture diagram ships without a prefix */
const BUILTIN_ARCHITECTURE_ICONS = new Set(['cloud', 'database', 'disk', 'internet', 'server', 'blank', 'unknown']);

function offsetToLineColumn(code: string, offset: number): { line: number; column: number } {
  const before = code.slice(0, offset);
  const line = before.split('\n').length;
  return { line, column: offset - before.lastIndexOf('\n') };
}

interface LangiumResult {
  lexerErrors: Array<{ message: string; offset: number; length: number; line?: number; column?: number }>;
  parserErrors: Array<{ message: string; token: { image: string; startLine?: number; startColumn?: number } }>;
}

/** First line of a parser message, with tokens like `\n` made readable */
function tidy(message: string): string {
  return message
    .split('\n')[0]
    .replace(/`\n`|'\n'/g, 'end of line')
    .trim();
}

/**
 * Structured diagnostic from an error thrown by `mermaid.parse`/`render`.
 * Langium-based diagrams (architecture-beta, ...) attach the parser result,
 * Jison-based ones (flowchart, ...) a `hash.loc`; both carry exact positions
 * that the plain message lacks or buries.
 */
export function diagnosticFromError(err: unknown, code: string): Diagnostic {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const result = (err as { result?: LangiumResult })?.result;

  if (result && (result.lexerErrors?.length || result.parserErrors?.length)) {
    const lexer = result.lexerErrors[0];
    if (lexer) {
      const pos = offsetToLineColumn(code, lexer.offset);
      const char = code.substr(lexer.offset, lexer.length || 1);
      return { message: `Unexpected character ${JSON.stringify(char)}`, ...pos };
    }
    const parser = result.parserErrors[0];
    const { startLine, startColumn } = parser.token;
    const location = Number.isFinite(startLine)
      ? { line: startLine, column: startColumn }
      : { line: code.trimEnd().split('\n').length }; // token is EOF
    return { message: tidy(parser.message), ...location };
  }

  const loc = (err as { hash?: { loc?: { first_line: number; first_column: number } } })?.hash?.loc;
  const message = raw
    .split('\n')
    .filter((line) => !/^\s+at\s/.test(line) && line.trim())
    .map((line) => line.replace(/^Error:\s*/, '').trim())
    .join('\n') || 'Unknown syntax error';
  if (loc) return { message, line: loc.first_line, column: loc.first_column + 1 };
  return { message, ...locateError(message, code) };
}

/** Extract a line/column from the various error formats Mermaid/JSON produce */
export function locateError(message: string, code: string): { line?: number; column?: number } {
  let m = /\(line (\d+) column (\d+)\)/.exec(message);
  if (m) return { line: Number(m[1]), column: Number(m[2]) };

  m = /at position (\d+)/.exec(message);
  if (m) return offsetToLineColumn(code, Number(m[1]));

  m = /line[:\s]+(\d+)(?:,?\s*column[:\s]+(\d+))?/i.exec(message);
  if (m) return { line: Number(m[1]), column: m[2] ? Number(m[2]) : undefined };

  // e.g. "The right-hand id [zzz] does not yet exist": point at its first use
  m = /\bid \[([^\]]+)\]/.exec(message);
  if (m) {
    const at = new RegExp(`(?<![\\w-])${m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).exec(code);
    if (at) return offsetToLineColumn(code, at.index);
  }

  return {};
}

/** Source excerpt around `line` with line numbers and an optional caret */
export function codeExcerpt(code: string, line: number, column?: number, context = 2): string {
  const lines = code.split('\n');
  if (line > lines.length) {
    line = lines.length; // errors "after the last line" (unexpected end of input)
    column = undefined;
  }
  const first = Math.max(1, line - context);
  const last = Math.min(lines.length, line + context);
  const width = String(last).length;
  const out: string[] = [];
  for (let n = first; n <= last; n++) {
    const marker = n === line ? '>' : ' ';
    out.push(`${marker} ${String(n).padStart(width)} | ${lines[n - 1]}`);
    if (n === line && column) out.push(`  ${' '.repeat(width)} | ${' '.repeat(column - 1)}^`);
  }
  return out.join('\n');
}

const ARCHITECTURE_KEYWORD = /^\s*(architecture-beta|service|group|junction|%%|$)/;
const ARCHITECTURE_NODE = /^\s*\w+\s+[\w-]+(\([^()]*\))?(\[[^[\]()]*\])?(\s+in\s+[\w-]+)?\s*$/;
const ARCHITECTURE_EDGE = /^\s*[\w-]+(\{group\})?:[LRTB]\s*<?-->?\s*[LRTB]:[\w-]+(\{group\})?\s*$/;

/** Add a likely fix to an architecture-beta error, based on the failing line */
export function withHint(diagnostic: Diagnostic, code: string): Diagnostic {
  if (!diagnostic.line || !/^\s*architecture-beta/.test(code)) return diagnostic;
  const text = code.split('\n')[diagnostic.line - 1] ?? '';
  let hint: string | null = null;

  if (/<?--?>?/.test(text) && !ARCHITECTURE_KEYWORD.test(text)) {
    if (!ARCHITECTURE_EDGE.test(text)) {
      hint = 'Edges look like "a:R --> L:b" (ID:SIDE, arrow, SIDE:ID); SIDE is L, R, T or B; ' +
        'arrows are --, -->, <-- or <-->.';
    }
  } else if (!ARCHITECTURE_KEYWORD.test(text)) {
    const word = text.trim().split(/\s+/)[0];
    hint = `"${word}" is not a keyword. Lines must start with service, group or junction, ` +
      'or be an edge like "a:R --> L:b".';
  } else if (/^\s*(service|group)\b/.test(text) && !ARCHITECTURE_NODE.test(text)) {
    hint = 'Expected: service ID(ICON)[Label] in GROUP — ICON, [Label] and "in GROUP" are optional; ' +
      'labels cannot contain brackets or parentheses.';
  }

  return hint ? { ...diagnostic, message: `${diagnostic.message}\nHint: ${hint}` } : diagnostic;
}

/**
 * Find icon references in architecture-beta code that aren't in `known`
 * (a set of `prefix:name` strings).
 */
export function findUnknownIcons(code: string, known: Set<string>): Diagnostic[] {
  if (!/^\s*architecture-beta/m.test(code)) return [];
  const diagnostics: Diagnostic[] = [];
  const re = /^(\s*(?:service|group|junction)\s+[\w-]+\()([^)]*)\)/gm;
  for (const m of code.matchAll(re)) {
    const icon = m[2].trim();
    const known_ = icon.includes(':') ? known.has(icon) : BUILTIN_ARCHITECTURE_ICONS.has(icon);
    if (known_) continue;
    const { line, column } = offsetToLineColumn(code, m.index! + m[1].length);
    diagnostics.push({
      message: `Unknown icon "${icon}" (renders as a "?" placeholder). ` +
        `Use lucide:<name>, hub:<name> or logo:<name>; search them with the CLI's \`icons\` command.`,
      line,
      column,
    });
  }
  return diagnostics;
}
