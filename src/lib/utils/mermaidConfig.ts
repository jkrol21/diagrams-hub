import mermaid from 'mermaid';
import type { ThemeConfig } from '../types';
import { hubIcons } from '../icons/hub';
import { buildLogoIconPack } from '../icons/logos';

/** Register all icon packs for architecture diagrams (Lucide + Hub + Logos) */
export async function registerArchitectureIcons(): Promise<void> {
  const { icons } = await import('@iconify-json/lucide');

  const packs: Parameters<typeof mermaid.registerIconPacks>[0] = [
    { name: icons.prefix, icons },
    { name: hubIcons.prefix, icons: hubIcons },
  ];

  // Add logo pack if any logo files exist in src/assets/logos/
  const logoPack = await buildLogoIconPack();
  if (logoPack) {
    packs.push({ name: logoPack.prefix, icons: logoPack });
  }

  mermaid.registerIconPacks(packs);
}

/** Initialize Mermaid with a theme configuration */
export function initializeMermaid(theme: ThemeConfig): void {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: mapThemeToMermaid(theme),
    securityLevel: 'loose',
    fontFamily: theme.fonts.fontFamily,
    fontSize: theme.fonts.fontSize,
    architecture: {
      iconSize: 72,
      padding: 40
    }
  });
}

/** Map our theme config to Mermaid's theme variables */
export function mapThemeToMermaid(theme: ThemeConfig): Record<string, string | number> {
  return {
    primaryColor: theme.colors.primaryColor,
    primaryTextColor: theme.colors.primaryTextColor,
    primaryBorderColor: theme.colors.primaryBorderColor,
    lineColor: theme.colors.lineColor,
    secondaryColor: theme.colors.secondaryColor,
    tertiaryColor: theme.colors.tertiaryColor,
    background: theme.colors.background,
    mainBkg: theme.colors.mainBkg,
    textColor: theme.colors.textColor,
    nodeTextColor: theme.colors.nodeTextColor,
    fontFamily: theme.fonts.fontFamily,
    fontSize: `${theme.fonts.fontSize}px`,
    archEdgeColor: '#4C78A8',
    archEdgeArrowColor: '#4C78A8',
    archGroupBorderColor: '#dee2e6'
  };
}

/** Render Mermaid diagram and return SVG string */
export async function renderDiagram(
  code: string,
  elementId: string
): Promise<{ svg: string; error: string | null }> {
  try {
    // Validate syntax first
    const isValid = await mermaid.parse(code);
    if (!isValid) {
      return { svg: '', error: 'Invalid diagram syntax' };
    }

    // Render the diagram
    const { svg } = await mermaid.render(elementId, code);
    return { svg, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Keep meaningful lines from the error, strip stack traces
    const cleanMessage = message
      .split('\n')
      .filter(line => !line.match(/^\s+at\s/) && line.trim().length > 0)
      .map(line => line.replace(/^Error:\s*/, '').trim())
      .filter(Boolean)
      .join('\n');
    return { svg: '', error: cleanMessage || 'Unknown syntax error' };
  }
}

/** Generate a unique element ID for Mermaid rendering */
export function generateMermaidId(): string {
  return `mermaid-${crypto.randomUUID().slice(0, 8)}`;
}
