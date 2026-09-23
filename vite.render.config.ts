import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Build of the headless renderer used by the CLI (cli/diagrams-hub.ts).
// Output goes to .cli-cache/render and is rebuilt automatically when sources change.
export default defineConfig({
  plugins: [svelte()],
  logLevel: 'warn',
  build: {
    outDir: '.cli-cache/render',
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { input: 'render.html' }
  }
});
