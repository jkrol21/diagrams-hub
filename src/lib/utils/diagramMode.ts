export type DiagramMode = 'mermaid' | 'excalidraw';

const EXCALIDRAW_ELEMENT_TYPES = new Set([
  'rectangle', 'ellipse', 'diamond', 'arrow', 'line',
  'text', 'freedraw', 'image', 'frame', 'embeddable',
]);

export function detectDiagramMode(code: string): DiagramMode {
  const trimmed = code.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return 'mermaid';

  try {
    const parsed = JSON.parse(trimmed);

    // Explicit type marker
    if (parsed.type === 'excalidraw') return 'excalidraw';

    // Detect by elements array
    const elements = Array.isArray(parsed) ? parsed : parsed.elements;
    if (Array.isArray(elements) && elements.length > 0) {
      const first = elements[0];
      if (
        first &&
        typeof first === 'object' &&
        typeof first.type === 'string' &&
        EXCALIDRAW_ELEMENT_TYPES.has(first.type)
      ) {
        return 'excalidraw';
      }
    }
  } catch {
    // not valid JSON → treat as mermaid
  }

  return 'mermaid';
}
