/**
 * Dynamic logo icon pack built from PNG/SVG files in src/assets/logos/.
 *
 * Drop a file like `aws.png` into that folder and use it as `logo:aws`
 * in your architecture-beta diagrams.
 *
 * PNG files are converted to base64 data URIs so they work with PNG export.
 * SVG files are inlined directly for best quality.
 */
import type { IconifyJSON } from '@iconify/types';

// Vite discovers all logo files at build time
const logoPngs = import.meta.glob<string>('/src/assets/logos/*.png', {
  eager: true,
  import: 'default',
});

const logoSvgs = import.meta.glob<string>('/src/assets/logos/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

function nameFromPath(path: string): string {
  return path.split('/').pop()!.replace(/\.(png|svg)$/i, '').toLowerCase();
}

/** Convert a URL (or data URI) to a base64 data URI */
async function toDataUri(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Extract SVG inner content (everything inside the <svg> tag) */
function extractSvgBody(raw: string): { body: string; width: number; height: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'image/svg+xml');
  const svg = doc.documentElement;

  const vb = svg.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
  const width = vb?.[2] ?? parseFloat(svg.getAttribute('width') || '24');
  const height = vb?.[3] ?? parseFloat(svg.getAttribute('height') || '24');

  // Grab all child elements as the body
  const body = svg.innerHTML;
  return { body, width, height };
}

/**
 * Build an Iconify-format icon pack from logo files.
 * Call this once at startup; it's async because PNGs need fetching for base64.
 */
export async function buildLogoIconPack(): Promise<IconifyJSON | null> {
  const icons: Record<string, { body: string; width: number; height: number }> = {};
  const size = 64;

  // Process PNG logos → embed as base64 <image> in SVG
  for (const [path, url] of Object.entries(logoPngs)) {
    const name = nameFromPath(path);
    try {
      const dataUri = await toDataUri(url);
      icons[name] = {
        body: `<image href="${dataUri}" x="0" y="0" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`,
        width: size,
        height: size,
      };
    } catch (e) {
      console.warn(`[logos] Failed to load ${name}:`, e);
    }
  }

  // Process SVG logos → inline the SVG body directly
  for (const [path, raw] of Object.entries(logoSvgs)) {
    const name = nameFromPath(path);
    try {
      const { body, width, height } = extractSvgBody(raw);
      icons[name] = { body, width, height };
    } catch (e) {
      console.warn(`[logos] Failed to parse SVG ${name}:`, e);
    }
  }

  if (Object.keys(icons).length === 0) return null;

  return {
    prefix: 'logo',
    icons,
    width: size,
    height: size,
  };
}
