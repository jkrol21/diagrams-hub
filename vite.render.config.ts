import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Build of the headless renderer used by the CLI (cli/diagrams-hub.mjs).
// Output goes to cli/renderer and is committed, so users and agents never build anything:
// rebuild with `npm run build:renderer` (scripts/build-renderer.mjs) after changing src/.
export default defineConfig({
  plugins: [svelte()],
  logLevel: 'warn',
  build: {
    outDir: 'cli/renderer',
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { input: 'render.html' }
  }
});
