#!/usr/bin/env bun
/**
 * diagrams-hub CLI — render/validate diagrams headlessly, for agents and scripts.
 *
 * Renders with the exact same code path as the web app (Mermaid config, Lucide/
 * hub/logo icon packs, Excalidraw renderer) by driving a small build of
 * `render.html` (see src/render.ts) in headless Chromium via Playwright.
 *
 * Run `bun cli/diagrams-hub.ts help` for usage.
 */
import { createServer, type Server } from 'node:http';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeExcerpt, type Diagnostic } from '../src/lib/utils/diagnostics';
import type { RenderResult } from '../src/render';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = join(ROOT, '.cli-cache', 'render');
const STAMP = join(BUILD_DIR, '.build-stamp');
const DEFAULT_MAX_SIZE = 1200;
const MAX_SCALE = 2;

const HELP = `diagrams-hub — render and validate diagrams (Mermaid / Excalidraw JSON) from the command line.

Renders exactly like the Diagrams Hub web app, including the lucide:, hub: and
logo: icon packs for architecture-beta diagrams. Built for agents: paste code in,
get precise syntax errors (line, column, source excerpt) or a PNG sized for
visual inspection.

USAGE
  diagrams-hub render [FILE|-] [options]   Validate and render to PNG (default command)
  diagrams-hub check  [FILE|-] [options]   Validate only, no image
  diagrams-hub icons  [FILTER]             List available icon names (e.g. "icons data")
  diagrams-hub help                        Show this help

  Input is read from FILE, or from stdin when FILE is "-" or omitted.
  Without the global link, run as:  bun /path/to/diagrams-hub/cli/diagrams-hub.ts ...

OPTIONS
  -o, --out PATH       PNG output path. Default: next to FILE (foo.mmd -> foo.png),
                       or $TMPDIR/diagrams-hub/diagram-<hash>.png for stdin
  -m, --max-size PX    Longest side of the PNG in pixels (default ${DEFAULT_MAX_SIZE}); small
                       diagrams are upscaled at most ${MAX_SCALE}x
      --svg PATH       Also write the rendered SVG to PATH
  -c, --code TEXT      Use TEXT as the diagram source instead of FILE/stdin
      --json           Machine-readable output on stdout (see OUTPUT)

EXIT CODES
  0  rendered/valid (warnings may still be reported)
  1  diagram error (syntax error, invalid JSON, nothing to render)
  2  usage or environment error (bad arguments, browser missing, build failed)

OUTPUT
  Text mode prints "OK ..." with the image path, or "ERROR ..." with the message,
  location and a source excerpt ("> 3 | ..." marks the line, "^" the column).
  Warnings (e.g. unknown icon names, which Mermaid silently draws as "?") are
  printed with location in both cases.
  --json prints: {"ok", "mode", "image", "svg", "width", "height", "error",
  "warnings"}; error/warnings entries are {"message", "line", "column"}.

EXAMPLES
  diagrams-hub render diagram.mmd                 # -> diagram.png
  diagrams-hub check diagram.mmd --json
  cat <<'EOF' | diagrams-hub render - -o /tmp/arch.png
  architecture-beta
      group api(hub:network)[API Layer]
      service gateway(lucide:globe)[API Gateway] in api
      service db(lucide:database)[Database]
      gateway:R --> L:db
  EOF

ARCHITECTURE-BETA CHEAT SHEET
  architecture-beta                               first line
  group ID(ICON)[Label]                           group (optionally: in PARENT)
  service ID(ICON)[Label] in GROUP                node; "in GROUP" is optional
  junction ID                                     invisible connection point
  A:R --> L:B                                     edge from A's right side to B's left
                                                  sides: L R T B; arrows: -- --> <-- <-->
  A{group}:B --> T:C                              edge leaving the group boundary of A
  Icons: lucide:<name> (~1,600, https://lucide.dev/icons), hub:<name> (service, vps,
  firewall, loadbalancer, queue, network, api, bucket, monitoring), logo:<name>
  (files in src/assets/logos). Run "diagrams-hub icons FILTER" to search.
  IDs: letters, digits, "_" or "-"; labels may contain spaces but not brackets.

  Other Mermaid diagram types (flowchart, sequenceDiagram, ...) render too.
  Excalidraw: JSON {"type":"excalidraw","elements":[...]} or a bare element array.

SETUP (once, inside the repo)
  bun install && bunx playwright install chromium
  bun link                                        # optional: puts "diagrams-hub" on PATH
  If the Playwright browser is missing, a system Chrome is used when available;
  set DIAGRAMS_HUB_CHROMIUM=/path/to/chrome to force a specific binary.
`;

// ── Argument parsing ────────────────────────────────────────────────────────

interface Options {
  command: 'render' | 'check' | 'icons' | 'help';
  input?: string;
  code?: string;
  out?: string;
  svg?: string;
  maxSize: number;
  json: boolean;
  filter?: string;
}

class UsageError extends Error {}

function parseArgs(argv: string[]): Options {
  const opts: Options = { command: 'render', maxSize: DEFAULT_MAX_SIZE, json: false };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`Missing value for ${arg}`);
      return v;
    };
    switch (arg) {
      case '-h': case '--help': opts.command = 'help'; return opts;
      case '-o': case '--out': opts.out = value(); break;
      case '--svg': opts.svg = value(); break;
      case '-c': case '--code': opts.code = value(); break;
      case '--json': opts.json = true; break;
      case '-m': case '--max-size': {
        const n = Number(value());
        if (!Number.isFinite(n) || n < 50) throw new UsageError('--max-size must be a number >= 50');
        opts.maxSize = Math.round(n);
        break;
      }
      default:
        if (arg.startsWith('-') && arg !== '-') throw new UsageError(`Unknown option: ${arg}`);
        positional.push(arg);
    }
  }

  if (['render', 'check', 'icons', 'help'].includes(positional[0])) {
    opts.command = positional.shift() as Options['command'];
  }
  if (opts.command === 'icons') opts.filter = positional.shift();
  else opts.input = positional.shift();
  if (positional.length) throw new UsageError(`Unexpected argument: ${positional[0]}`);
  return opts;
}

async function readInput(opts: Options): Promise<string> {
  if (opts.code !== undefined) return opts.code;
  if (opts.input && opts.input !== '-') {
    if (!existsSync(opts.input)) throw new UsageError(`File not found: ${opts.input}`);
    return readFileSync(opts.input, 'utf8');
  }
  if (process.stdin.isTTY) {
    throw new UsageError('No input: pass a FILE, --code TEXT, or pipe the diagram on stdin');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

// ── Icons (no browser needed) ───────────────────────────────────────────────

async function listIcons(filter?: string): Promise<string[]> {
  const lucide = JSON.parse(readFileSync(join(ROOT, 'node_modules/@iconify-json/lucide/icons.json'), 'utf8'));
  const { hubIcons } = await import('../src/lib/icons/hub');
  const logoDir = join(ROOT, 'src/assets/logos');
  const logos = existsSync(logoDir)
    ? readdirSync(logoDir).filter((f) => /\.(png|svg)$/i.test(f)).map((f) => f.replace(/\.(png|svg)$/i, '').toLowerCase())
    : [];

  const names = [
    ...Object.keys(hubIcons.icons).map((n) => `hub:${n}`),
    ...logos.map((n) => `logo:${n}`),
    ...[...Object.keys(lucide.icons), ...Object.keys(lucide.aliases ?? {})].sort().map((n) => `lucide:${n}`),
  ];
  const f = filter?.toLowerCase();
  return f ? names.filter((n) => n.includes(f)) : names;
}

// ── Renderer build + static server ──────────────────────────────────────────

function newestMtime(path: string): number {
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = st.mtimeMs;
  for (const entry of readdirSync(path)) newest = Math.max(newest, newestMtime(join(path, entry)));
  return newest;
}

function ensureRendererBuilt(): void {
  const inputs = ['src', 'render.html', 'vite.render.config.ts', 'package.json', 'bun.lock']
    .map((p) => join(ROOT, p))
    .filter(existsSync);
  const sourceTime = Math.max(...inputs.map(newestMtime));
  if (existsSync(STAMP) && statSync(STAMP).mtimeMs >= sourceTime) return;

  process.stderr.write('diagrams-hub: building headless renderer (first run or sources changed)...\n');
  const viteBin = join(ROOT, 'node_modules/vite/bin/vite.js');
  if (!existsSync(viteBin)) throw new EnvError(`Dependencies missing. Run: cd ${ROOT} && bun install`);
  const res = spawnSync(process.execPath, [viteBin, 'build', '-c', 'vite.render.config.ts'], {
    cwd: ROOT,
    stdio: ['ignore', 2, 2],
  });
  if (res.status !== 0) throw new EnvError('Building the headless renderer failed (see output above)');
  writeFileSync(STAMP, new Date().toISOString());
}

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json',
};

function serveBuild(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const file = resolve(BUILD_DIR, '.' + (path === '/' ? '/render.html' : path));
    if (!file.startsWith(BUILD_DIR) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      ok({ server, url: `http://127.0.0.1:${port}/render.html` });
    });
  });
}

// ── Browser ─────────────────────────────────────────────────────────────────

class EnvError extends Error {}

async function launchBrowser() {
  const { chromium } = await import('playwright');
  const explicit = process.env.DIAGRAMS_HUB_CHROMIUM;
  if (explicit) return chromium.launch({ executablePath: explicit });
  try {
    return await chromium.launch();
  } catch (first) {
    try {
      return await chromium.launch({ channel: 'chrome' });
    } catch {
      throw new EnvError(
        'No Chromium found for headless rendering. Run once: ' +
        `cd ${ROOT} && bunx playwright install chromium\n` +
        `(or set DIAGRAMS_HUB_CHROMIUM=/path/to/chrome)\n\n${(first as Error).message.split('\n')[0]}`,
      );
    }
  }
}

// ── Render ──────────────────────────────────────────────────────────────────

interface Output {
  ok: boolean;
  mode: string;
  image: string | null;
  svg: string | null;
  width: number;
  height: number;
  error: Diagnostic | null;
  warnings: Diagnostic[];
}

function defaultImagePath(opts: Options, code: string): string {
  if (opts.input && opts.input !== '-') {
    return opts.input.replace(/\.[^./\\]+$/, '') + '.png';
  }
  const hash = createHash('sha1').update(code).digest('hex').slice(0, 10);
  return join(tmpdir(), 'diagrams-hub', `diagram-${hash}.png`);
}

async function renderCode(code: string, opts: Options): Promise<Output> {
  ensureRendererBuilt();
  const { server, url } = await serveBuild();
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => 'diagramsHub' in window, null, { timeout: 15000 }).catch(() => {
      throw new EnvError(`Headless renderer failed to load: ${pageErrors.join('; ') || 'timeout'}`);
    });

    const result: RenderResult = await page.evaluate((c) => window.diagramsHub.render(c), code);
    const output: Output = {
      ok: !result.error,
      mode: result.mode,
      image: null,
      svg: null,
      width: 0,
      height: 0,
      error: result.error,
      warnings: result.warnings,
    };
    if (result.error || opts.command === 'check') return output;

    if (opts.svg) {
      const svg = await page.evaluate(() => window.diagramsHub.getSvg());
      mkdirSync(dirname(resolve(opts.svg)), { recursive: true });
      writeFileSync(opts.svg, svg);
      output.svg = resolve(opts.svg);
    }

    const scale = Math.min(MAX_SCALE, opts.maxSize / Math.max(result.width, result.height));
    const width = Math.max(1, Math.round(result.width * scale));
    const height = Math.max(1, Math.round(result.height * scale));
    await page.evaluate(([w, h]) => window.diagramsHub.setSize(w, h), [width, height]);
    await page.setViewportSize({ width: width + 20, height: height + 20 });
    await page.evaluate(() => document.fonts.ready);

    const image = resolve(opts.out ?? defaultImagePath(opts, code));
    mkdirSync(dirname(image), { recursive: true });
    await page.locator('#out > svg').screenshot({ path: image });
    return { ...output, image, width, height };
  } finally {
    await browser.close();
    server.close();
  }
}

// ── Reporting ───────────────────────────────────────────────────────────────

function describe(d: Diagnostic, code: string): string {
  const where = d.line ? `line ${d.line}${d.column ? `, column ${d.column}` : ''}` : null;
  const lines = [where ? `${where}: ${d.message}` : d.message];
  if (d.line) lines.push(codeExcerpt(code, d.line, d.column));
  return lines.join('\n');
}

function report(out: Output, code: string, opts: Options): void {
  if (opts.json) {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }
  const lines: string[] = [];
  if (out.error) {
    lines.push(`ERROR (${out.mode}) ${describe(out.error, code)}`);
  } else if (opts.command === 'check') {
    lines.push(`OK (${out.mode}) diagram is valid`);
  } else {
    lines.push(`OK (${out.mode}) rendered ${out.width}x${out.height}px`, `image: ${out.image}`);
    if (out.svg) lines.push(`svg: ${out.svg}`);
  }
  for (const w of out.warnings) lines.push(`WARNING ${describe(w, code)}`);
  process.stdout.write(lines.join('\n') + '\n');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.command === 'help') {
    process.stdout.write(HELP);
    return 0;
  }

  if (opts.command === 'icons') {
    const icons = await listIcons(opts.filter);
    if (opts.json) process.stdout.write(JSON.stringify(icons) + '\n');
    else process.stdout.write(icons.length ? icons.join('\n') + '\n' : `No icons match "${opts.filter}"\n`);
    return 0;
  }

  const code = await readInput(opts);
  const out = await renderCode(code, opts);
  report(out, code, opts);
  return out.ok ? 0 : 1;
}

main().then(
  (status) => process.exit(status),
  (err) => {
    if (err instanceof UsageError) {
      process.stderr.write(`diagrams-hub: ${err.message}\nRun "diagrams-hub help" for usage.\n`);
    } else {
      process.stderr.write(`diagrams-hub: ${err instanceof Error ? err.message : err}\n`);
    }
    process.exit(2);
  },
);
