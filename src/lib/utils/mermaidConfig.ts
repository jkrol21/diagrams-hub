import mermaid from 'mermaid';
import type { ThemeConfig } from '../types';

/** Initialize Mermaid with a theme configuration */
export function initializeMermaid(theme: ThemeConfig): void {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: mapThemeToMermaid(theme),
    securityLevel: 'loose',
    fontFamily: theme.fonts.fontFamily,
    fontSize: theme.fonts.fontSize
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
    fontSize: `${theme.fonts.fontSize}px`
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
    // Extract just the error message, not the full stack
    const cleanMessage = message.split('\n')[0].replace(/^Error:\s*/, '');
    return { svg: '', error: cleanMessage };
  }
}

/** Generate a unique element ID for Mermaid rendering */
export function generateMermaidId(): string {
  return `mermaid-${crypto.randomUUID().slice(0, 8)}`;
}
