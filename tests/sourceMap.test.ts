import { describe, expect, test } from 'bun:test';
import {
  codeIdentifiers,
  findDefinition,
  findEdge,
  findLabel,
  excalidrawElementRanges,
  locateExcalidrawElement,
} from '../src/lib/utils/sourceMap';

const ARCH = `architecture-beta
    group api(hub:network)[API Layer]
    %% app is great
    service gateway(lucide:globe)[API Gateway] in api
    service app(hub:service)[App Service] in api
    service app-db(lucide:database)[DB]

    gateway:R --> L:app
    app:B --> T:app-db`;

const at = (code: string, r: { from: number; to: number } | null) => r && code.slice(r.from, r.to);
const block = (code: string, r: { blockFrom: number; blockTo: number } | null) =>
  r && code.slice(r.blockFrom, r.blockTo).trim();

describe('mermaid source mapping', () => {
  test('collects identifiers, ignoring keywords and comments', () => {
    const ids = codeIdentifiers(ARCH);
    expect(ids).toContain('gateway');
    expect(ids).toContain('app-db');
    expect(ids).not.toContain('service');
    expect(ids).not.toContain('great');
  });

  test('finds the definition line, not the first reference', () => {
    const code = 'flowchart LR\n  A --> B\n  B[Second] --> C';
    expect(block(code, findDefinition(code, 'B'))).toBe('B[Second] --> C');
  });

  test('finds keyword definitions and skips comments', () => {
    const r = findDefinition(ARCH, 'app');
    expect(at(ARCH, r)).toBe('app');
    expect(block(ARCH, r)).toBe('service app(hub:service)[App Service] in api');
  });

  test('treats ids with dashes as whole tokens', () => {
    expect(block(ARCH, findDefinition(ARCH, 'app-db'))).toBe('service app-db(lucide:database)[DB]');
  });

  test('finds edges in either direction', () => {
    expect(block(ARCH, findEdge(ARCH, 'app', 'app-db'))).toBe('app:B --> T:app-db');
    expect(block(ARCH, findEdge(ARCH, 'app', 'gateway'))).toBe('gateway:R --> L:app');
  });

  test('finds labels inside brackets', () => {
    const r = findLabel(ARCH, 'App Service');
    expect(at(ARCH, r)).toBe('App Service');
    expect(block(ARCH, r)).toBe('service app(hub:service)[App Service] in api');
  });
});

describe('excalidraw source mapping', () => {
  const doc = `{
  "type": "excalidraw",
  "elements": [
    { "type": "rectangle", "x": 0, "y": 0, "label": "a } tricky \\" string" },
    {
      "type": "text",
      "text": "hi",
      "points": [[0, 0], [1, 1]]
    }
  ],
  "appState": { "viewBackgroundColor": "#fff" }
}`;

  test('finds element object ranges', () => {
    const ranges = excalidrawElementRanges(doc);
    expect(ranges.length).toBe(2);
    expect(JSON.parse(doc.slice(ranges[1].from, ranges[1].to)).type).toBe('text');
  });

  test('works for a bare element array', () => {
    const arr = '[{"type":"rectangle"},{"type":"ellipse"}]';
    expect(excalidrawElementRanges(arr).map((r) => arr.slice(r.from, r.to))).toEqual([
      '{"type":"rectangle"}',
      '{"type":"ellipse"}',
    ]);
  });

  test('selects the type entry and highlights the whole object', () => {
    const r = locateExcalidrawElement(doc, 1)!;
    expect(at(doc, r)).toBe('"type": "text"');
    expect(doc.slice(r.blockFrom, r.blockTo).trim().startsWith('{')).toBe(true);
    expect(locateExcalidrawElement(doc, 5)).toBeNull();
  });
});

test('matches labels whose rendered whitespace differs', () => {
  const code = 'architecture-beta\n  group backend(hub:vps)[Backend Services]';
  expect(findLabel(code, 'BackendServices')).not.toBeNull();
  expect(code.slice(findLabel(code, 'Backend\nServices')!.from, findLabel(code, 'Backend\nServices')!.to)).toBe('Backend Services');
});

test('single-letter node names are identifiers', () => {
  const ids = codeIdentifiers('flowchart LR\n  A --> B\n  L --> R');
  expect(ids).toEqual(expect.arrayContaining(['A', 'B', 'L', 'R']));
});
