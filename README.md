# Diagrams Hub

Browser-based tool for creating presentation-ready architecture diagrams. Paste `architecture-beta` Mermaid code, get polished output with icons, export as high-res PNG.

## Quick Start

```bash
bun install
bun run dev
```

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
    app:B --> T:db
    worker:B --> T:db
    worker:R --> L:storage
```

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Dev server at localhost:5173
bun run build        # Production build
bun run preview      # Preview production build
bun run check        # Type-check
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
