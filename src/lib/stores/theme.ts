import { writable, get } from 'svelte/store';
import type { ThemeConfig } from '../types';
import { saveToLocalStorage, loadFromLocalStorage } from '../utils/localStorage';

const STORAGE_KEY = 'mermaid-editor:theme';

/** Default light theme */
export const DEFAULT_THEME: ThemeConfig = {
  id: 'light',
  name: 'Light',
  colors: {
    primaryColor: '#4C78A8',
    primaryTextColor: '#1a1a1a',
    primaryBorderColor: '#3d6085',
    lineColor: '#666666',
    secondaryColor: '#F5A623',
    tertiaryColor: '#e9eef5',
    background: '#ffffff',
    mainBkg: '#f8f9fa',
    textColor: '#333333',
    nodeTextColor: '#1a1a1a',
    clusterBkg: '#f4f7fb',
    clusterBorder: '#c9d6e6',
    titleColor: '#33475b',
    edgeLabelBackground: '#ffffff',
    noteBkgColor: '#fff8db',
    noteBorderColor: '#e6c55c',
    archEdgeColor: '#4C78A8'
  },
  fonts: {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 14
  }
};

/** Built-in theme presets */
export const THEME_PRESETS: ThemeConfig[] = [
  DEFAULT_THEME,
  {
    id: 'neutral',
    name: 'Neutral',
    colors: {
      primaryColor: '#6c757d',
      primaryTextColor: '#212529',
      primaryBorderColor: '#495057',
      lineColor: '#495057',
      secondaryColor: '#dee2e6',
      tertiaryColor: '#f1f3f5',
      background: '#ffffff',
      mainBkg: '#ffffff',
      textColor: '#212529',
      nodeTextColor: '#212529',
      clusterBkg: '#f8f9fa',
      clusterBorder: '#adb5bd',
      titleColor: '#343a40',
      edgeLabelBackground: '#ffffff',
      noteBkgColor: '#f1f3f5',
      noteBorderColor: '#adb5bd',
      archEdgeColor: '#495057'
    },
    fonts: {
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: 14
    }
  },
  {
    id: 'dark',
    name: 'Dark',
    colors: {
      primaryColor: '#58A6FF',
      primaryTextColor: '#e6e6e6',
      primaryBorderColor: '#388BFD',
      lineColor: '#8b949e',
      secondaryColor: '#F78166',
      tertiaryColor: '#21262d',
      background: '#0d1117',
      mainBkg: '#161b22',
      textColor: '#c9d1d9',
      nodeTextColor: '#e6e6e6',
      clusterBkg: '#11161d',
      clusterBorder: '#30363d',
      titleColor: '#c9d1d9',
      edgeLabelBackground: '#0d1117',
      noteBkgColor: '#2d2a1f',
      noteBorderColor: '#6e5b1f',
      archEdgeColor: '#58A6FF'
    },
    fonts: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 14
    }
  }
];

/**
 * Fill in keys missing from a stored/partial theme (e.g. saved before a
 * color was added) from the default theme.
 */
export function normalizeTheme(theme: Partial<ThemeConfig> | null | undefined): ThemeConfig {
  return {
    id: theme?.id ?? DEFAULT_THEME.id,
    name: theme?.name ?? DEFAULT_THEME.name,
    colors: { ...DEFAULT_THEME.colors, ...theme?.colors },
    fonts: { ...DEFAULT_THEME.fonts, ...theme?.fonts }
  };
}

function createThemeStore() {
  const stored = loadFromLocalStorage<ThemeConfig>(STORAGE_KEY);
  const theme = writable<ThemeConfig>(normalizeTheme(stored));

  // Persist theme changes
  theme.subscribe((t) => {
    saveToLocalStorage(STORAGE_KEY, t);
  });

  return {
    subscribe: theme.subscribe,

    /** Set the active theme */
    setTheme(newTheme: ThemeConfig) {
      theme.set(normalizeTheme(newTheme));
    },

    /** Change a single color (marks the theme as customized) */
    setColor(key: keyof ThemeConfig['colors'], value: string) {
      theme.update((t) => ({ ...t, id: 'custom', name: 'Custom', colors: { ...t.colors, [key]: value } }));
    },

    /** Change font settings (marks the theme as customized) */
    setFonts(fonts: Partial<ThemeConfig['fonts']>) {
      theme.update((t) => ({ ...t, id: 'custom', name: 'Custom', fonts: { ...t.fonts, ...fonts } }));
    },

    /** Get current theme */
    getTheme(): ThemeConfig {
      return get(theme);
    },

    /** Reset to default theme */
    reset() {
      theme.set(DEFAULT_THEME);
    }
  };
}

export const themeStore = createThemeStore();
