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
    tertiaryColor: '#7BC96F',
    background: '#ffffff',
    mainBkg: '#f8f9fa',
    textColor: '#333333',
    nodeTextColor: '#1a1a1a'
  },
  fonts: {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 14
  }
};

/** Built-in theme presets (for future theme editor) */
export const THEME_PRESETS: ThemeConfig[] = [
  DEFAULT_THEME,
  {
    id: 'dark',
    name: 'Dark',
    colors: {
      primaryColor: '#58A6FF',
      primaryTextColor: '#e6e6e6',
      primaryBorderColor: '#388BFD',
      lineColor: '#8b949e',
      secondaryColor: '#F78166',
      tertiaryColor: '#7EE787',
      background: '#0d1117',
      mainBkg: '#161b22',
      textColor: '#c9d1d9',
      nodeTextColor: '#e6e6e6'
    },
    fonts: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 14
    }
  }
];

function createThemeStore() {
  const stored = loadFromLocalStorage<ThemeConfig>(STORAGE_KEY);
  const theme = writable<ThemeConfig>(stored || DEFAULT_THEME);

  // Persist theme changes
  theme.subscribe((t) => {
    saveToLocalStorage(STORAGE_KEY, t);
  });

  return {
    subscribe: theme.subscribe,

    /** Set the active theme */
    setTheme(newTheme: ThemeConfig) {
      theme.set(newTheme);
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
