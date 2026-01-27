/** Represents a saved diagram document */
export interface DiagramDocument {
  id: string;
  name: string;
  code: string;
  theme?: string;
  createdAt: number;
  updatedAt: number;
}

/** Theme configuration for Mermaid diagrams */
export interface ThemeConfig {
  id: string;
  name: string;
  colors: {
    primaryColor: string;
    primaryTextColor: string;
    primaryBorderColor: string;
    lineColor: string;
    secondaryColor: string;
    tertiaryColor: string;
    background: string;
    mainBkg: string;
    textColor: string;
    nodeTextColor: string;
  };
  fonts: {
    fontFamily: string;
    fontSize: number;
  };
}

/** Export options for PNG/SVG export */
export interface ExportOptions {
  format: 'png' | 'svg';
  backgroundColor: 'transparent' | string;
  scale: number;
  filename: string;
}

/** UI state for editor layout */
export interface UIState {
  splitPosition: number;
  showPreview: boolean;
  zoom: number;
}

/** Context provided to AI chat (future extension) */
export interface DiagramContext {
  code: string;
  errors: string[];
  screenshot?: Blob;
  theme?: ThemeConfig;
}

/** Save status for the status bar */
export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';
