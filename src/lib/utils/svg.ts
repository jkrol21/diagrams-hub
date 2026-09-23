/** Helpers for sizing rendered SVGs (preview, fit-to-view, PNG export) */

/** Natural size of an SVG from its viewBox (falls back to width/height attributes) */
export function svgSize(svgEl: Element): { x: number; y: number; width: number; height: number } {
  const viewBox = svgEl.getAttribute('viewBox');
  if (viewBox) {
    const [x, y, width, height] = viewBox.split(/[\s,]+/).map(Number);
    if (width > 0 && height > 0) return { x, y, width, height };
  }
  const width = parseFloat(svgEl.getAttribute('width') || '') || 800;
  const height = parseFloat(svgEl.getAttribute('height') || '') || 600;
  return { x: 0, y: 0, width, height };
}

/**
 * Give an SVG string its natural pixel size (from the viewBox). Mermaid emits
 * width="100%" plus a max-width style, which makes the SVG shrink to its
 * (unsized) container and breaks fit-to-view and zoom percentages.
 */
export function normalizeSvgSize(svg: string): string {
  const open = /^\s*<svg\b[^>]*>/.exec(svg);
  if (!open) return svg;
  const viewBox = /\sviewBox="([^"]*)"/.exec(open[0]);
  const [, , width, height] = viewBox ? viewBox[1].split(/[\s,]+/).map(Number) : [];
  if (!(width > 0 && height > 0)) return svg;
  const tag = open[0]
    .replace(/\s(width|height)="[^"]*"/g, '')
    .replace(/max-width:\s*[^;"]*;?/, '')
    .replace(/^(\s*<svg\b)/, `$1 width="${width}" height="${height}"`);
  return tag + svg.slice(open[0].length);
}
