# Diagrams Hub

Browser-based tool for creating presentation-ready architecture diagrams. Paste `architecture-beta` Mermaid code, get polished output with icons, export as high-res PNG.

## Quick Start

```bash
npm install && npm run dev      # or: bun install && bun run dev
```

## Let AI Agents See Their Diagrams

`cli/diagrams-hub.mjs` checks diagram code and renders it to a PNG the agent can open and look at —
same renderer and icons as the app. It needs only Node.js 20+ (or Bun) and sets itself up on the first
run (installs its dependencies, uses an installed Chrome/Edge/Chromium or downloads a headless Chromium
once). **Nothing to install beforehand, neither by you nor by the agent.**

Paste this into your agents' instructions (fix the path to where you cloned this repo):

````markdown
## Rendering diagrams

To check a Mermaid or Excalidraw diagram and see what it looks like, run:

    node /path/to/diagrams-hub/cli/diagrams-hub.mjs render diagram.mmd

- Success prints `image: /absolute/path/diagram.png` — open that PNG to inspect the diagram visually.
- A syntax error prints `ERROR line X, column Y: ...` plus the offending source lines — fix and rerun.
- Without a file, pipe the code in: `node /path/to/diagrams-hub/cli/diagrams-hub.mjs render - < diagram.mmd`
  (or a heredoc); the image path is printed the same way.
- `... icons <word>` lists icon names for architecture-beta; `... help` has all options and a syntax cheat sheet.
- The first run sets itself up (may take a minute). Do not install bun, playwright or browsers yourself.
````

Optionally `npm link` (or `bun link`) in this repo puts a global `diagrams-hub` command on the PATH.

## Icons

Three icon packs are available in your diagrams:

### Lucide (~1,500 general-purpose icons)

The full [Lucide](https://lucide.dev/icons/) icon set. Browse all icons at [lucide.dev/icons](https://lucide.dev/icons/).

```
service db(lucide:database)[Database]
service api(lucide:globe)[API Gateway]
service auth(lucide:shield)[Auth]
```

### Hub (predefined infrastructure icons)

Custom icons for common architecture components. Use the `hub:` prefix.

| Icon               | Description                        |
| ------------------ | ---------------------------------- |
| `hub:service`      | Containerized service (app in Docker) |
| `hub:vps`          | Virtual private server / server rack  |
| `hub:firewall`     | Firewall / network security           |
| `hub:loadbalancer` | Load balancer / traffic distributor   |
| `hub:queue`        | Message queue                         |
| `hub:network`      | Network / internet / globe            |
| `hub:api`          | API endpoint                          |
| `hub:bucket`       | Storage bucket / object store         |
| `hub:monitoring`   | Monitoring / observability dashboard  |

```
service app(hub:service)[My App]
service fw(hub:firewall)[Firewall]
service lb(hub:loadbalancer)[Load Balancer]
```

### Logos (drop-in custom images)

Add your own PNG or SVG logos and reference them with the `logo:` prefix. The filename (without extension) becomes the icon name.

**How to add a logo:**

1. Put your image file in `src/assets/logos/`
   ```
   src/assets/logos/
   ├── aws.png
   ├── docker.svg
   └── python.png
   ```

2. Use it in your diagram with the `logo:` prefix:
   ```
   service cloud(logo:aws)[AWS Cloud]
   service app(logo:docker)[Docker Container]
   service ml(logo:python)[ML Service]
   ```

3. Restart the dev server if it was already running (Vite discovers files at build time)

**Tips for logo files:**
- Use square images (e.g. 128x128 px) with transparent backgrounds
- SVG logos scale perfectly and are preferred over PNG
- PNG logos are embedded as base64, so they work in PNG export
- Filename is lowercased automatically: `Docker.png` becomes `logo:docker`

## Example Diagram

```
architecture-beta
    group api(hub:network)[API Layer]
    group backend(hub:vps)[Backend Services]
    group data(lucide:database)[Data Layer]

    service gateway(lucide:globe)[API Gateway] in api
    service fw(hub:firewall)[Firewall] in api

    service app(hub:service)[App Service] in backend
    service worker(lucide:zap)[Worker] in backend
    service cache(lucide:hard-drive)[Cache] in backend

    service db(lucide:database)[Database] in data
    service storage(hub:bucket)[Object Store] in data

    gateway:R --> L:fw
    fw:R --> L:app
    app:R --> L:cache
    app:B --> T:worker
    worker:B --> T:db
    worker:R --> L:storage
```

## Click to Edit

Click any element in the preview (service, group, edge, label, or an Excalidraw shape) and the editor
jumps to its definition: the line is highlighted, the id is selected and the cursor is ready for typing.
Dragging still pans the canvas; double-clicking a label still edits it inline.

## Style Panel

**Style** in the toolbar opens a panel for the rendering look: presets (Light, Neutral, Dark), colors for
nodes, groups (subgraphs, class diagram namespaces, architecture groups), edges, notes and the
background, plus font family and size. Changes apply live and are used for the PNG export.
"Copy JSON" copies the theme for the CLI's `--theme` option.

## Examples

**Examples** in the toolbar loads a sample for each supported diagram type (from `examples/`).
`npm run examples` renders all of them with the CLI as a smoke test.

## Navigating the Preview

Scroll or pinch to zoom toward the cursor (5%–1000%), drag to pan. The preview keeps the diagram fitted
until you zoom or pan yourself; double-click the background or use the fit button to fit again, and the
% button for 100%.

## CLI Reference

```bash
node cli/diagrams-hub.mjs render diagram.mmd          # -> diagram.png, max 1200px on the longest side
node cli/diagrams-hub.mjs render - -o /tmp/a.png < diagram.mmd
node cli/diagrams-hub.mjs check diagram.mmd --json    # validate only, machine-readable
node cli/diagrams-hub.mjs icons server                # find icon names
node cli/diagrams-hub.mjs render x.mmd -t theme.json  # colors/fonts from the Style panel ("Copy JSON")
node cli/diagrams-hub.mjs setup                       # optional: do the one-time setup right now
node cli/diagrams-hub.mjs help                        # everything else
```

Inside the repo, `npm run diagram -- ...` / `bun run diagram ...` work too.

Syntax errors come with line, column, a source excerpt and — for architecture-beta — a hint:

```
ERROR (mermaid) line 2, column 12: Expecting token of type ':' but found `a`.
Hint: "servce" is not a keyword. Lines must start with service, group or junction, or be an edge like "a:R --> L:b".
  1 | architecture-beta
> 2 |     servce a(lucide:globe)[A]
    |            ^
```

Unknown icon names (which Mermaid silently draws as a "?") are reported as warnings. Exit codes: 0 ok,
1 diagram error, 2 the tool couldn't run (the message says why).

If no browser can be started (e.g. a bare Linux server without Chromium's system libraries), the CLI
says so; install Google Chrome, set `DIAGRAMS_HUB_CHROMIUM=/path/to/chrome`, or run
`npx playwright install-deps chromium` once as root.

## Commands

Everything works with npm or Bun (`npm run X` / `bun run X`); Bun is only required for the unit tests.

```bash
npm install          # Install dependencies
npm run dev          # Dev server at localhost:5173
npm run build        # Production build
npm run preview      # Preview production build
npm run check        # Type-check
npm run examples     # Render all examples with the CLI (smoke test)
bun test             # Unit tests (needs Bun)
```

## Adding New Hub Icons

To add a new predefined SVG icon to the `hub:` pack, edit `src/lib/icons/hub.ts`. Icons follow Lucide conventions:

- 24x24 viewBox
- Stroke-based, 2px stroke width
- Use `currentColor` for strokes/fills

```typescript
myicon: {
  body: `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
    <circle cx="12" cy="12" r="10"/>
  </g>`,
},
```
