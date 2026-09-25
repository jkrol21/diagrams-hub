/**
 * Bundled Inter font (the default diagram font). Mermaid measures text while
 * laying out, so the font must be loaded before rendering — `fontsReady()`.
 * Exported PNGs are rasterized from an <img>, which can't see page fonts, so
 * the export embeds the font files (`embeddedFontCss()`).
 */
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff2?url';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?url';

const INTER_FILES: Array<[number, string]> = [[400, inter400], [500, inter500], [600, inter600]];

let loaded: Promise<unknown> | null = null;

export function fontsReady(): Promise<unknown> {
  loaded ??= Promise.all(INTER_FILES.map(([weight]) => document.fonts.load(`${weight} 14px Inter`)));
  return loaded;
}

let embedded: Promise<string> | null = null;

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** @font-face rules for Inter with the font files inlined as data URLs */
export function embeddedFontCss(): Promise<string> {
  embedded ??= Promise.all(
    INTER_FILES.map(async ([weight, url]) =>
      `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};` +
      `src:url('${await toDataUrl(url)}') format('woff2');}`
    )
  ).then((rules) => rules.join(''));
  return embedded;
}
