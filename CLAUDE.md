# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Diagrams Hub is a browser-based tool for creating **presentation-ready architecture diagrams**. Built with Svelte 5, TypeScript, CodeMirror 6, and Mermaid 11. The workflow: paste AI-generated `architecture-beta` code, get polished output with Lucide icons, and export as high-res PNG for slides. Single-page app, no routing.

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Dev server at localhost:5173 (auto-opens browser)
bun run build        # Production build to dist/
bun run preview      # Preview production build
bun run check        # Type-check Svelte + TypeScript (svelte-check)
```

Package manager is **Bun** (lockfile: `bun.lock`). No test runner is configured.

## Architecture

**Entry flow:** `index.html` → `src/main.ts` → `App.svelte` (mounts on `#app`)

**Source layout (`src/lib/`):**
- `components/` — Svelte 5 components (Editor, Preview, SplitPane, Toolbar, ErrorDisplay, StatusBar)
- `stores/` — Svelte writable stores for diagram state, UI layout, and theme
- `types/` — TypeScript types + File System Access API declarations
- `utils/` — File I/O (File System Access API with fallback), localStorage persistence, Mermaid init/render, PNG export

**Key data flow:**
- `App.svelte` owns the diagram store subscription and passes data down via props
- `Editor.svelte` wraps CodeMirror 6; emits code changes upward
- `Preview.svelte` renders Mermaid SVG with 300ms debounce; subscribes to theme store; emits rendered SVG via `onrender` callback
- `App.svelte` tracks the last rendered SVG and wires it to the Export PNG button in the Toolbar
- Persistence: auto-saves to localStorage (500ms debounce); file system save is user-triggered

**Icon pack:** `@iconify-json/lucide` is registered in `Preview.svelte` on mount via `registerArchitectureIcons()` from `mermaidConfig.ts`. Provides ~1,500 Lucide icons for `architecture-beta` diagrams (e.g. `lucide:server`, `lucide:database`, `lucide:cloud`).

**PNG export:** `src/lib/utils/exportPng.ts` — Pure browser Canvas API implementation. Takes SVG string, injects white background, rasterizes at 2x scale, downloads as PNG.

**State stores (`src/lib/stores/`):**
- `diagram.ts` — Document content, save status, errors, file handle
- `ui.ts` — Split pane position (20–80%), zoom (0.5–2×), preview toggle
- `theme.ts` — Colors and fonts; dark theme preset exists but is unused

**localStorage keys:** `mermaid-editor:active`, `mermaid-editor:ui`, `mermaid-editor:theme`

## Conventions

- **Svelte 5 runes:** Use `$state()`, `$derived()`, `$effect()`, `$props()` — not legacy `$:` or `export let`
- **Scoped styles:** All component CSS is scoped; global styles/CSS variables in `src/app.css`
- **Theming:** CSS custom properties (`--ui-bg`, `--accent-primary`, etc.) defined in `app.css`
- Mermaid security level is set to `'loose'`
- Mermaid architecture config: `iconSize: 72`, `padding: 40`
- File types: `.mmd` and `.mermaid`
- Default template is an `architecture-beta` 3-tier diagram with Lucide icons
