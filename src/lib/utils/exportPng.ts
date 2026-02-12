/** Export an SVG string as a high-resolution PNG download */
export function exportToPng(
  svgString: string,
  filename: string,
  scale: number = 2
): void {
  // Parse SVG to extract dimensions
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = svgDoc.documentElement;

  let width: number;
  let height: number;

  const viewBox = svgEl.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    width = parts[2];
    height = parts[3];
  } else {
    width = parseFloat(svgEl.getAttribute('width') || '800');
    height = parseFloat(svgEl.getAttribute('height') || '600');
  }

  // Inject white background as first child of SVG using absolute dimensions
  const rect = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', viewBox ? viewBox.split(/[\s,]+/)[0] : '0');
  rect.setAttribute('y', viewBox ? viewBox.split(/[\s,]+/)[1] : '0');
  rect.setAttribute('width', String(width));
  rect.setAttribute('height', String(height));
  rect.setAttribute('fill', '#ffffff');
  svgEl.insertBefore(rect, svgEl.firstChild);

  // Ensure SVG has explicit dimensions for rasterization
  svgEl.setAttribute('width', String(width));
  svgEl.setAttribute('height', String(height));
  // Remove max-width style that Mermaid adds
  svgEl.style.removeProperty('max-width');

  const serializer = new XMLSerializer();
  const svgData = serializer.serializeToString(svgEl);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d')!;
  const img = new Image();

  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${filename}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  };

  img.src = url;
}
