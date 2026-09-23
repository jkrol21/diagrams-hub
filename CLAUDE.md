# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Diagrams Hub is a browser-based tool for creating **presentation-ready architecture diagrams**. Built with Svelte 5, TypeScript, CodeMirror 6, and Mermaid 11. The workflow: paste AI-generated `architecture-beta` code, get polished output with Lucide icons, and export as high-res PNG for slides. Single-page app, no routing.

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Dev server at localhost:5173 (auto-opens browser; BROWSER=none to suppress)
bun run build        # Production build to dist/
bun run preview      # Preview production build
bun run check        # Type-check Svelte + TypeScript (svelte-check)
bun test             # Unit tests (bun's built-in runner, tests/*.test.ts)
bun run diagram ...  # Agent CLI, see "Agent CLI" below (= bun cli/diagrams-hub.ts ...)
```

**Bun is the package manager and script runner** (lockfile: `bun.lock`; never use npm/yarn/pnpm
to add deps — use `bun add` / `bun add -d`). If `bun` is missing: `curl -fsSL https://bun.sh/install | bash`
(needs `unzip`), or without unzip/root: `npm install --prefix ~/.local bun` and symlink
`~/.local/node_modules/.bin/bun` into `~/.local/bin`. Tests use `bun:test` and live in `tests/`
(outside `src/`, so svelte-check doesn't type-check them); keep them to pure functions — DOM/rendering
behaviour is verified through the CLI or a browser.

## Architecture

**Entry flow:** `index.html` → `src/main.ts` → `App.svelte` (mounts on `#app`)

**Source layout (`src/lib/`):**
- `components/` — Svelte 5 components (Editor, Preview, SplitPane, Toolbar, ErrorDisplay, StatusBar)
- `stores/` — Svelte writable stores for diagram state, UI layout, and theme
- `types/` — TypeScript types + File System Access API declarations
- `icons/` — `hub:` icon pack (`hub.ts`) and the `logo:` pack built from `src/assets/logos/` (`logos.ts`)
- `utils/` — File I/O (File System Access API with fallback), localStorage persistence, Mermaid init/render, Excalidraw renderer, PNG export, plus:
  - `sourceMap.ts` — maps a clicked SVG element back to a source range (click-to-source)
  - `diagnostics.ts` — structured errors (line/column from Langium `err.result` / Jison `err.hash.loc` / JSON positions), source excerpts, unknown-icon warnings, architecture-beta hints

**Other entry points:** `render.html` → `src/render.ts` is a headless renderer (no UI) that exposes
`window.diagramsHub` for the CLI; `cli/diagrams-hub.ts` is the CLI itself.

**Key data flow:**
- `App.svelte` owns the diagram store subscription and passes data down via props
- `Editor.svelte` wraps CodeMirror 6; emits code changes upward
- `Preview.svelte` renders Mermaid SVG with 300ms debounce; subscribes to theme store; emits rendered SVG via `onrender` callback
- `App.svelte` tracks the last rendered SVG and wires it to the Export PNG button in the Toolbar
- Persistence: auto-saves to localStorage (500ms debounce); file system save is user-triggered

**Click-to-source:** a click (not a drag) in `Preview.svelte` resolves the target via `sourceMap.ts` and
calls `onselect(range)`; `App.svelte` passes the range to `Editor.svelte` as `highlight`, which selects the
token, adds a line decoration (`cm-diagram-highlight`, mapped through edits), scrolls it into view and
focuses the editor. Mermaid elements resolve through the ids Mermaid writes into the SVG
(`service-<id>`, `group-<id>`, `flowchart-<id>-N`, edges `L_<from>_<to>_N`, subgraph ids), then the
clicked label text; unfilled group/subgraph areas via a bounding-box hit test. Excalidraw elements are
tagged with `data-el-index` in `excalidrawRender.ts` and mapped to their object in the JSON text.
If Mermaid changes its SVG id scheme, this is where it breaks.

**Icon pack:** `@iconify-json/lucide` is registered in `Preview.svelte` on mount via `registerArchitectureIcons()` from `mermaidConfig.ts`. Provides ~1,500 Lucide icons for `architecture-beta` diagrams (e.g. `lucide:server`, `lucide:database`, `lucide:cloud`).

**PNG export:** `src/lib/utils/exportPng.ts` — Pure browser Canvas API implementation. Takes SVG string, injects white background, rasterizes at 2x scale, downloads as PNG.

**State stores (`src/lib/stores/`):**
- `diagram.ts` — Document content, save status, errors, file handle
- `ui.ts` — Split pane position (20–80%), zoom (0.5–2×), preview toggle
- `theme.ts` — Colors and fonts; dark theme preset exists but is unused

**localStorage keys:** `mermaid-editor:active`, `mermaid-editor:ui`, `mermaid-editor:theme`

## Agent CLI (`cli/diagrams-hub.ts`)

For agents/scripts: validate a diagram and get a PNG for visual inspection, rendered by the same code
as the app. `bun run diagram help` prints the full usage (the help text is the agent-facing
documentation — keep it in sync when changing behaviour).

```bash
bun run diagram render diagram.mmd              # -> diagram.png (longest side 1200px by default)
bun run diagram check - < diagram.mmd --json    # validate only, JSON result
bun run diagram icons database                  # search lucide:/hub:/logo: icon names
```

- Exit codes: 0 ok (warnings possible), 1 diagram error, 2 usage/environment error.
- How it works: builds `render.html` with `vite.render.config.ts` into `.cli-cache/render/` (gitignored;
  rebuilt automatically when anything in `src/`, `package.json` or `bun.lock` is newer than the build
  stamp — first run takes ~10s, later runs ~1-2s), serves it on a random localhost port, and drives it
  with Playwright's Chromium (`bunx playwright install chromium` once; falls back to system Chrome, or
  `DIAGRAMS_HUB_CHROMIUM=/path`).
- `bun link` exposes it globally as `diagrams-hub` (`bin` in `package.json`).

## Conventions

- **Svelte 5 runes:** Use `$state()`, `$derived()`, `$effect()`, `$props()` — not legacy `$:` or `export let`
- **Scoped styles:** All component CSS is scoped; global styles/CSS variables in `src/app.css`
- **Theming:** CSS custom properties (`--ui-bg`, `--accent-primary`, etc.) defined in `app.css`
- Mermaid security level is set to `'loose'`
- Mermaid architecture config: `iconSize: 72`, `padding: 40`
- File types: `.mmd` and `.mermaid`
- Default template is an `architecture-beta` 3-tier diagram with Lucide icons
