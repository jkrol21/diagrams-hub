import { svgSize } from './svg';

/**
 * Export an SVG string as a high-resolution PNG download.
 *
 * The SVG is loaded as a `data:` URL, not a `blob:` URL: Mermaid renders most
 * labels as HTML inside `<foreignObject>`, and Chrome marks a canvas as
 * tainted (so `toBlob` throws) when such an SVG comes from a blob URL.
 *
 * Rejects with a readable error instead of failing silently.
 */
export async function exportToPng(
  svgString: string,
  filename: string,
  scale: number = 2,
  background: string = '#ffffff'
): Promise<void> {
  const blob = await svgToPngBlob(svgString, scale, background);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function svgToPngBlob(svgString: string, scale: number, background: string): Promise<Blob> {
  const svgDoc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const svgEl = svgDoc.documentElement;
  if (svgEl.nodeName === 'parsererror' || svgDoc.querySelector('parsererror')) {
    throw new Error('The rendered SVG could not be parsed for export.');
  }

  const { x, y, width, height } = svgSize(svgEl);

  // Background as first child, covering the viewBox
  const rect = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', String(x));
  rect.setAttribute('y', String(y));
  rect.setAttribute('width', String(width));
  rect.setAttribute('height', String(height));
  rect.setAttribute('fill', background);
  svgEl.insertBefore(rect, svgEl.firstChild);

  // Explicit dimensions for rasterization (Mermaid uses width="100%" + max-width)
  svgEl.setAttribute('width', String(width));
  svgEl.setAttribute('height', String(height));
  (svgEl as unknown as SVGElement).style?.removeProperty('max-width');

  const svgData = new XMLSerializer().serializeToString(svgEl);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('The browser could not load the diagram as an image.'));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed.'))), 'image/png');
    } catch (err) {
      // Tainted canvas (e.g. browsers that block foreignObject in images)
      reject(new Error(`This browser blocked the PNG export: ${(err as Error).message}`));
    }
  });
}
