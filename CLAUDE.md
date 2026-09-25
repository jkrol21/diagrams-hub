# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Diagrams Hub is a browser-based tool for creating **presentation-ready architecture diagrams**. Built with Svelte 5, TypeScript, CodeMirror 6, and Mermaid 11. The workflow: paste AI-generated `architecture-beta` code, get polished output with Lucide icons, and export as high-res PNG for slides. Single-page app, no routing.

## Commands

```bash
bun install          # Install dependencies (npm install works too)
bun run dev          # Dev server at localhost:5173 (auto-opens browser; BROWSER=none to suppress)
bun run build        # Production build to dist/
bun run preview      # Preview production build
bun run check        # Type-check Svelte + TypeScript (svelte-check)
bun test             # Unit tests (bun's built-in runner, tests/*.test.ts) — the only command that needs Bun
bun run examples     # Smoke test: render every file in examples/ via the CLI (-> .cli-cache/examples/)
node cli/diagrams-hub.mjs ...   # Agent CLI, see "Agent CLI" below
```

**Runtime: Bun for development, Node for users.** `bun.lock` is the lockfile, so add dependencies with
`bun add` / `bun add -d` when Bun is available. But everything a *user or agent* runs — the app scripts
and especially the CLI — must work with plain Node/npm too: the user's machines often have no Bun, and
agents that are told "run bun ..." start installing Bun. So: no `bun`-only APIs (`Bun.*`, `import.meta.dir`,
`bun:*`) in `cli/` or `scripts/`, and user-facing docs show `node`/`npm` commands. If `bun` is missing
here: `npm install --prefix ~/.local bun` and symlink `~/.local/node_modules/.bin/bun` into `~/.local/bin`.
Tests use `bun:test` and live in `tests/` (outside `src/`, so svelte-check doesn't type-check them); keep
them to pure functions — DOM/rendering behaviour is verified through the CLI or a browser.

## Architecture

**Entry flow:** `index.html` → `src/main.ts` → `App.svelte` (mounts on `#app`)

**Source layout (`src/lib/`):**
- `components/` — Svelte 5 components (Editor, Preview, SplitPane, Toolbar, ErrorDisplay, StatusBar, ThemePanel)
- `stores/` — Svelte writable stores for diagram state, UI layout, and theme
- `types/` — TypeScript types + File System Access API declarations
- `icons/` — `hub:` icon pack (`hub.ts`) and the `logo:` pack built from `src/assets/logos/` (`logos.ts`)
- `utils/` — File I/O (File System Access API with fallback), localStorage persistence, Mermaid init/render, Excalidraw renderer, PNG export, plus:
  - `sourceMap.ts` — maps a clicked SVG element back to a source range (click-to-source)
  - `svg.ts` — natural SVG size from the viewBox; `normalizeSvgSize` replaces Mermaid's `width="100%"` + `max-width` (otherwise the preview SVG shrinks to its unsized container and fit/zoom break)
  - `diagnostics.ts` — structured errors (line/column from Langium `err.result` / Jison `err.hash.loc` / JSON positions), source excerpts, unknown-icon warnings, architecture-beta hints

**Examples:** `examples/` has one file per diagram type (architecture, flowchart, sequence, class with
namespaces, state, ER, gantt, mindmap, Excalidraw). They feed the toolbar's Examples menu
(`import.meta.glob` in `Toolbar.svelte`), `examples/architecture.mmd` is the default template for new
diagrams, and `npm run examples` / `bun run examples` renders all of them. Add a file there when touching a diagram type.

**Other entry points:** `render.html` → `src/render.ts` is a headless renderer (no UI) that exposes
`window.diagramsHub` for the CLI; `cli/diagrams-hub.mjs` is the CLI itself.

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

**Preview zoom/fit (`Preview.svelte`):** the preview auto-fits (max 200%) until the user wheels, pans or
uses the zoom buttons; it refits on container resize while auto-fitting, and whenever the diagram type
(first keyword) changes or the size changes by more than 3x (a different diagram was pasted). Zoom range
5%–1000%, wheel zoom is proportional to `deltaY` (smooth on trackpads/pinch). Double-clicking the
background fits; the % button jumps to 100%.

**Looks (styles × palettes):** `utils/looks.ts` defines Tailwind color scales, palettes (ordered hue
lists), the three styles (`outline`/`solid`/`soft` → `roles()` per hue), `buildTheme(look)`,
`lookVariables()` (mindmap `cScale*`, pie, gantt, sequence, ER variables) and the `%% style:` /
`%% palette:` directives. `resolveTheme(base, code, override)` gives the theme actually used — priority:
directives in the code > CLI flags > Style panel / `--theme`; classic themes (`look: null`) stay classic
unless a look is requested. Mermaid theme variables can only give everything the first hue, so
`utils/applyLook.ts` post-processes the SVG *in the DOM* (it needs layout): top-level groups get
consecutive hues (starting at the second when there are ungrouped nodes), nodes take their innermost
group's hue by geometry, architecture icons get tiles, the architecture groups layer moves behind the
services (Mermaid draws it on top), edge labels get dark text on white. It skips author-styled nodes
(inline `fill`), state start/end dots and mindmap branches (colored via `cScale*`). Preview and
`src/render.ts` both call it after inserting the SVG and export the serialized result. Adding a palette:
`PALETTES` in looks.ts plus the list and help text in `cli/diagrams-hub.mjs`. Check changes with
`node cli/diagrams-hub.mjs render examples/X.mmd -s solid` for each style — every diagram type has its
own SVG structure.

**Fonts:** Inter is bundled (`utils/fonts.ts`, `@fontsource/inter`); rendering waits for it because
Mermaid measures text, and the PNG export inlines it (an `<img>` can't use page fonts).

**Theme / Style panel:** `ThemePanel.svelte` edits `themeStore` (style + palette, classic presets
Light/Neutral/Dark, per-color pickers, font family/size); any color/font edit marks the theme `custom`
(keeping its look). The default theme is `modern`/`soft`; stored themes without `look` stay classic. `normalizeTheme()` fills keys missing from
older stored themes — add new color keys to `ThemeConfig`, all presets and `mapThemeToMermaid`. Mermaid's
`base` theme derives cluster fill from `tertiaryColor` (green) and edge label background from
`secondaryColor` (orange), so `clusterBkg`/`edgeLabelBackground` etc. are set explicitly. Class diagram
namespaces get a hard-coded inline `fill:none;stroke:black !important` from Mermaid, which
`applyGroupColors()` in `mermaidConfig.ts` replaces with the theme's group colors. The preview canvas and
PNG export use `colors.background`.

**PNG export:** loads the SVG as a `data:` URL — with a `blob:` URL Chrome taints the canvas whenever
Mermaid uses HTML labels (`<foreignObject>`), and `toBlob` throws. Errors are shown via `alert`.

**Icon pack:** `@iconify-json/lucide` is registered in `Preview.svelte` on mount via `registerArchitectureIcons()` from `mermaidConfig.ts`. Provides ~1,500 Lucide icons for `architecture-beta` diagrams (e.g. `lucide:server`, `lucide:database`, `lucide:cloud`).

**State stores (`src/lib/stores/`):**
- `diagram.ts` — Document content, save status, errors, file handle
- `ui.ts` — Split pane position (20–80%), zoom (0.5–2×), preview toggle
- `theme.ts` — Colors and fonts (presets + custom), edited in the Style panel

**localStorage keys:** `mermaid-editor:active`, `mermaid-editor:ui`, `mermaid-editor:theme`

## Agent CLI (`cli/diagrams-hub.mjs`)

For agents/scripts (usually running in *other* repos): check a diagram and get a PNG to look at, rendered
by the same code as the app. The README has a copy-paste snippet for agent instructions; `help` prints the
full usage — the help text is the agent-facing documentation, keep it in sync when changing behaviour.

```bash
node cli/diagrams-hub.mjs render diagram.mmd              # -> diagram.png (longest side 1200px by default)
node cli/diagrams-hub.mjs check - --json < diagram.mmd    # validate only, JSON result
node cli/diagrams-hub.mjs icons database                  # search lucide:/hub:/logo: icon names
node cli/diagrams-hub.mjs render x.mmd -t theme.json      # render with a theme (Style panel -> "Copy JSON")
```

Design rule: **an agent must never need to install anything or read setup docs.** Past failure: the CLI was
TypeScript with a `bun` shebang and told users to run `bunx playwright install chromium`, so agents on
Node-only machines started installing Bun and Playwright. Hence:
- Plain ESM JavaScript with only `node:` built-ins; runs under `node` and `bun`. Anything that needs the
  app's TypeScript (error excerpts, icon lists, themes) runs in the browser page via `window.diagramsHub`
  (`src/render.ts`), not in the CLI process.
- Self-setup on every run, each step a no-op when done: `npm install` / `bun install` if `node_modules`
  is missing (whichever runtime runs the CLI); build `render.html` with `vite.render.config.ts` into
  `.cli-cache/render/` when anything in `src/` or `package.json` is newer than the stamp (~10s); start a
  browser, trying `DIAGRAMS_HUB_CHROMIUM` → Playwright's Chromium → Chrome/Edge channels → common
  Chromium/Brave paths → downloading Playwright's headless shell (`install --only-shell chromium`).
  Progress goes to stderr, stdout stays clean for `--json`.
- Environment problems exit with code 2 and a message aimed at the user, saying explicitly that more
  installs by the agent won't help.
- Exit codes: 0 ok (warnings possible), 1 diagram error, 2 usage/environment error.
- `npm link` / `bun link` exposes it globally as `diagrams-hub` (`bin` in `package.json`).

## Conventions

- **Svelte 5 runes:** Use `$state()`, `$derived()`, `$effect()`, `$props()` — not legacy `$:` or `export let`
- **Scoped styles:** All component CSS is scoped; global styles/CSS variables in `src/app.css`
- **Theming:** CSS custom properties (`--ui-bg`, `--accent-primary`, etc.) defined in `app.css`
- Mermaid security level is set to `'loose'`
- Mermaid architecture config: `iconSize: 72`, `padding: 40`
- File types: `.mmd` and `.mermaid`
- Default template is an `architecture-beta` 3-tier diagram with Lucide icons
