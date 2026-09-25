#!/usr/bin/env node
/**
 * diagrams-hub CLI — check diagram code and render it to a PNG, for agents and scripts.
 *
 * Plain JavaScript on purpose: runs with Node.js or Bun without a build step or
 * a TypeScript loader. Everything diagram-specific happens in the browser, in a
 * headless build of `render.html` (src/render.ts) that uses the exact same code
 * as the web app. Setup is automatic: missing dependencies are installed, the
 * renderer is (re)built when sources change, and an installed Chrome/Edge/
 * Chromium is used (or a headless Chromium is downloaded once).
 *
 * Run `node cli/diagrams-hub.mjs help` for usage.
 */
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'node ' + join(ROOT, 'cli', 'diagrams-hub.mjs');
const BUILD_DIR = join(ROOT, '.cli-cache', 'render');
const STAMP = join(BUILD_DIR, '.build-stamp');
const DEFAULT_MAX_SIZE = 1200;
const MAX_SCALE = 2;

const HELP = `diagrams-hub — check Mermaid / Excalidraw diagram code and render it to a PNG you can look at.

QUICK START — this is all you need
  ${SELF} render diagram.mmd

  OK    -> prints "image: /absolute/path/diagram.png". Open/read that PNG to see the diagram.
  ERROR -> prints the problem with line, column and the source lines around it. Fix the code
           and run the same command again.

  Runs with Node.js 20+ (or Bun). No setup needed and none to do: the first run installs
  its own dependencies and uses an installed Chrome/Edge/Chromium, or downloads a headless
  Chromium once (can take a minute). Do not install bun, playwright or browsers yourself.

COMMANDS
  render [FILE|-]   Check the diagram and render it to PNG (default command)
  check  [FILE|-]   Only check the syntax, no image
  icons  [FILTER]   List icon names usable in architecture-beta, e.g. "icons database"
  setup             Optional: do the one-time setup now instead of on the first render
  help              This text

  The diagram is read from FILE, or from stdin when FILE is "-" or omitted:
    ${SELF} render - -o /tmp/arch.png <<'EOF'
    architecture-beta
        service api(lucide:globe)[API]
        service db(lucide:database)[Database]
        api:R --> L:db
    EOF

OPTIONS
  -o, --out PATH       Where to write the PNG. Default: next to FILE (foo.mmd -> foo.png), or
                       $TMPDIR/diagrams-hub/diagram-<hash>.png when reading stdin
  -m, --max-size PX    Longest side of the PNG in pixels (default ${DEFAULT_MAX_SIZE})
  -c, --code TEXT      Diagram source as an argument instead of FILE/stdin
  -t, --theme FILE     Colors/fonts as JSON (the web app's Style panel -> "Copy JSON");
                       partial themes work: {"colors": {"clusterBkg": "#eef2f7"}}
      --svg PATH       Also write the SVG
      --json           Machine-readable result on stdout:
                       {"ok", "mode", "image", "svg", "width", "height", "error", "warnings"},
                       error/warnings: {"message", "line", "column", "excerpt"}

EXIT CODES
  0  OK (warnings, e.g. unknown icon names, may still be printed)
  1  the diagram has an error — fix the code
  2  the tool itself could not run (bad arguments, setup problem) — the message says why

DIAGRAM TYPES
  Every Mermaid type (flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram,
  gantt, mindmap, architecture-beta, ...) and Excalidraw JSON
  ({"type":"excalidraw","elements":[...]}). Examples: ${join(ROOT, 'examples')}

ARCHITECTURE-BETA CHEAT SHEET
  architecture-beta                        first line
  group ID(ICON)[Label]                    group; add "in PARENT" to nest
  service ID(ICON)[Label] in GROUP         node; "in GROUP" is optional
  junction ID                              invisible connection point
  A:R --> L:B                              edge from A's right side to B's left side
                                           sides: L R T B; arrows: -- --> <-- <-->
  A{group}:B --> T:C                       edge leaving the group boundary of A
  Icons: lucide:<name> (~1,600, lucide.dev/icons), hub:<name> (service, vps, firewall,
  loadbalancer, queue, network, api, bucket, monitoring), logo:<name>. Unknown names render
  as "?" and are reported as warnings. IDs: letters, digits, _ or -; labels: no brackets.
  Layout: services without an edge between them can end up on top of each other — check the
  PNG and add an edge (e.g. a:R --> L:b) to place them relative to each other.
`;

class UsageError extends Error {}
class EnvError extends Error {}

// ── Argument parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { command: 'render', maxSize: DEFAULT_MAX_SIZE, json: false };
  const positional = [];

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
      case '-t': case '--theme': opts.theme = value(); break;
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

  if (['render', 'check', 'icons', 'setup', 'help'].includes(positional[0])) {
    opts.command = positional.shift();
  }
  if (opts.command === 'icons') opts.filter = positional.shift();
  else if (opts.command === 'render' || opts.command === 'check') opts.input = positional.shift();
  if (positional.length) throw new UsageError(`Unexpected argument: ${positional[0]}`);
  return opts;
}

async function readInput(opts) {
  if (opts.code !== undefined) return opts.code;
  if (opts.input && opts.input !== '-') {
    if (!existsSync(opts.input)) throw new UsageError(`File not found: ${opts.input}`);
    return readFileSync(opts.input, 'utf8');
  }
  if (process.stdin.isTTY) {
    throw new UsageError('No diagram given: pass a FILE, --code TEXT, or pipe the code on stdin');
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function loadTheme(path) {
  if (!path) return undefined;
  if (!existsSync(path)) throw new UsageError(`Theme file not found: ${path}`);
  try {
    const theme = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof theme !== 'object' || theme === null) throw new Error('not an object');
    return theme;
  } catch (err) {
    throw new UsageError(`Invalid theme JSON in ${path}: ${err.message}`);
  }
}

// ── Automatic setup ─────────────────────────────────────────────────────────

const log = (msg) => process.stderr.write(`diagrams-hub: ${msg}\n`);

/** Run a command with its output on stderr (stdout stays clean for --json) */
function run(cmd, args, what) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: ['ignore', 2, 2],
    shell: process.platform === 'win32',
  });
  if (res.error || res.status !== 0) {
    throw new EnvError(`${what} failed (${res.error?.message ?? `exit code ${res.status}`}).`);
  }
}

/** Install node_modules with the runtime we're running on (bun or npm) */
function ensureDependencies() {
  const ready = ['vite/bin/vite.js', 'playwright/package.json', '@sveltejs/vite-plugin-svelte/package.json']
    .every((p) => existsSync(join(ROOT, 'node_modules', p)));
  if (ready) return;

  if (process.versions.bun) {
    log('first run: installing dependencies (bun install)...');
    run(process.execPath, ['install'], 'Installing dependencies with bun');
  } else {
    log('first run: installing dependencies (npm install, ~1 min)...');
    run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', '--no-update-notifier'], 'Installing dependencies with npm');
  }
}

function newestMtime(path) {
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = st.mtimeMs;
  for (const entry of readdirSync(path)) newest = Math.max(newest, newestMtime(join(path, entry)));
  return newest;
}

/** Build render.html into .cli-cache/render when missing or older than the sources */
function ensureRendererBuilt() {
  const inputs = ['src', 'render.html', 'vite.render.config.ts', 'package.json']
    .map((p) => join(ROOT, p))
    .filter((p) => existsSync(p));
  const sourceTime = Math.max(...inputs.map(newestMtime));
  if (existsSync(STAMP) && statSync(STAMP).mtimeMs >= sourceTime) return;

  log('building the renderer (first run or sources changed, ~10s)...');
  run(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '-c', 'vite.render.config.ts'],
    'Building the renderer');
  writeFileSync(STAMP, new Date().toISOString());
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json',
};

function serveBuild() {
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
      ok({ server, url: `http://127.0.0.1:${server.address().port}/render.html` });
    });
  });
}

// ── Browser ─────────────────────────────────────────────────────────────────

const SYSTEM_BROWSERS = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/usr/bin/brave-browser',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
];

/**
 * Start a headless browser, trying in order: DIAGRAMS_HUB_CHROMIUM, a
 * Playwright-managed Chromium, installed Chrome / Edge / Chromium / Brave,
 * and finally downloading Playwright's headless Chromium once.
 */
async function launchBrowser() {
  const playwright = await import(pathToFileURL(join(ROOT, 'node_modules/playwright/index.mjs')).href);
  const { chromium } = playwright;

  const explicit = process.env.DIAGRAMS_HUB_CHROMIUM;
  if (explicit) {
    try {
      return { browser: await chromium.launch({ executablePath: explicit }), name: explicit };
    } catch (err) {
      throw new EnvError(`DIAGRAMS_HUB_CHROMIUM=${explicit} could not be started: ${firstLine(err)}`);
    }
  }

  const attempts = [
    ['Playwright Chromium', {}],
    ['Google Chrome', { channel: 'chrome' }],
    ['Microsoft Edge', { channel: 'msedge' }],
    ...SYSTEM_BROWSERS.filter((p) => existsSync(p)).map((p) => [p, { executablePath: p }]),
  ];
  const failures = [];
  for (const [name, options] of attempts) {
    try {
      return { browser: await chromium.launch(options), name };
    } catch (err) {
      failures.push(`${name}: ${firstLine(err)}`);
    }
  }

  log('no browser found: downloading a headless Chromium once (~100 MB)...');
  try {
    run(process.execPath, [join(ROOT, 'node_modules/playwright/cli.js'), 'install', '--only-shell', 'chromium'],
      'Downloading Chromium');
    return { browser: await chromium.launch(), name: 'Playwright Chromium' };
  } catch (err) {
    failures.push(`downloaded Chromium: ${firstLine(err)}`);
  }

  throw new EnvError(
    'Could not start a headless browser for rendering. This needs the user, not more installs by an agent:\n' +
    '  - install Google Chrome, or set DIAGRAMS_HUB_CHROMIUM=/path/to/chrome-or-chromium\n' +
    '  - on a bare Linux server Chromium may lack system libraries; as root run once:\n' +
    `      cd ${ROOT} && npx playwright install-deps chromium\n` +
    `Details:\n  ${failures.join('\n  ')}`,
  );
}

function firstLine(err) {
  return String(err?.message ?? err).split('\n').find((l) => l.trim()) ?? 'unknown error';
}

/** Setup + open the renderer page; `fn(page)` does the work */
async function withRenderer(fn) {
  ensureDependencies();
  ensureRendererBuilt();
  const { server, url } = await serveBuild();
  const { browser, name } = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => 'diagramsHub' in window, null, { timeout: 20000 }).catch(() => {
      throw new EnvError(`The renderer page failed to load: ${pageErrors.join('; ') || 'timeout'}`);
    });
    return await fn(page, name);
  } finally {
    await browser.close();
    server.close();
  }
}

// ── Commands ────────────────────────────────────────────────────────────────

function defaultImagePath(opts, code) {
  if (opts.input && opts.input !== '-') return opts.input.replace(/\.[^./\\]+$/, '') + '.png';
  const hash = createHash('sha1').update(code).digest('hex').slice(0, 10);
  return join(tmpdir(), 'diagrams-hub', `diagram-${hash}.png`);
}

async function renderCode(code, opts) {
  const theme = loadTheme(opts.theme);
  return withRenderer(async (page) => {
    const result = await page.evaluate(([c, t]) => window.diagramsHub.render(c, t ?? undefined), [code, theme ?? null]);
    const output = {
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
  });
}

function describe(d) {
  const where = d.line ? `line ${d.line}${d.column ? `, column ${d.column}` : ''}: ` : '';
  return where + d.message + (d.excerpt ? '\n' + d.excerpt : '');
}

function report(out, opts) {
  if (opts.json) {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }
  const lines = [];
  if (out.error) {
    lines.push(`ERROR (${out.mode}) ${describe(out.error)}`);
  } else if (opts.command === 'check') {
    lines.push(`OK (${out.mode}) the diagram is valid`);
  } else {
    lines.push(`OK (${out.mode}) rendered ${out.width}x${out.height}px`, `image: ${out.image}`);
    if (out.svg) lines.push(`svg: ${out.svg}`);
  }
  for (const w of out.warnings) lines.push(`WARNING ${describe(w)}`);
  process.stdout.write(lines.join('\n') + '\n');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  switch (opts.command) {
    case 'help':
      process.stdout.write(HELP);
      return 0;

    case 'setup': {
      const name = await withRenderer(async (_page, browserName) => browserName);
      process.stdout.write(`OK setup complete — rendering with ${name}. Next: ${SELF} render FILE\n`);
      return 0;
    }

    case 'icons': {
      const all = await withRenderer((page) => page.evaluate(() => window.diagramsHub.listIcons()));
      const filter = opts.filter?.toLowerCase();
      const icons = filter ? all.filter((n) => n.includes(filter)) : all;
      if (opts.json) process.stdout.write(JSON.stringify(icons) + '\n');
      else process.stdout.write(icons.length ? icons.join('\n') + '\n' : `No icons match "${opts.filter}"\n`);
      return 0;
    }

    default: {
      const code = await readInput(opts);
      const out = await renderCode(code, opts);
      report(out, opts);
      return out.ok ? 0 : 1;
    }
  }
}

main().then(
  (status) => process.exit(status),
  (err) => {
    if (err instanceof UsageError) {
      process.stderr.write(`diagrams-hub: ${err.message}\nRun "${SELF} help" for usage.\n`);
    } else if (err instanceof EnvError) {
      process.stderr.write(`diagrams-hub: ${err.message}\n`);
    } else {
      process.stderr.write(`diagrams-hub: unexpected error: ${err?.stack ?? err}\n`);
    }
    process.exit(2);
  },
);
