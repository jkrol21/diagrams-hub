import { writable } from 'svelte/store';
import type { UIState } from '../types';
import { saveToLocalStorage, loadFromLocalStorage } from '../utils/localStorage';

const STORAGE_KEY = 'mermaid-editor:ui';

const DEFAULT_UI: UIState = {
  splitPosition: 50,
  showPreview: true,
  zoom: 1
};

function createUIStore() {
  const stored = loadFromLocalStorage<UIState>(STORAGE_KEY);
  const state = writable<UIState>(stored || DEFAULT_UI);

  // Persist UI state changes
  state.subscribe((s) => {
    saveToLocalStorage(STORAGE_KEY, s);
  });

  return {
    subscribe: state.subscribe,

    /** Set split pane position (0-100) */
    setSplitPosition(position: number) {
      state.update(s => ({ ...s, splitPosition: Math.max(20, Math.min(80, position)) }));
    },

    /** Toggle preview panel */
    togglePreview() {
      state.update(s => ({ ...s, showPreview: !s.showPreview }));
    },

    /** Set zoom level */
    setZoom(zoom: number) {
      state.update(s => ({ ...s, zoom: Math.max(0.5, Math.min(2, zoom)) }));
    },

    /** Reset to defaults */
    reset() {
      state.set(DEFAULT_UI);
    }
  };
}

export const uiStore = createUIStore();
