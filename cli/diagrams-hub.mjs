#!/usr/bin/env node
/**
 * diagrams-hub CLI — check diagram code and render it to a PNG, for agents and scripts.
 *
 * Plain JavaScript with only node: built-ins on purpose: runs with Node.js or Bun
 * without npm install, a build step or a TypeScript loader. Everything
 * diagram-specific happens in the browser, in the committed build of
 * `render.html` (src/render.ts, built into cli/renderer) that uses the exact
 * same code as the web app. Any installed Chrome/Edge/Chromium is started
 * headless — on WSL also the Windows one — see "Browser" below.
 *
 * Run `node cli/diagrams-hub.mjs help` for usage.
 */
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, release, tmpdir } from 'node:os';
import { delimiter, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'node ' + join(ROOT, 'cli', 'diagrams-hub.mjs');
// Prebuilt and committed (npm run build:renderer), so nothing is installed or built at runtime
const RENDERER_DIR = join(ROOT, 'cli', 'renderer');
const DEFAULT_MAX_SIZE = 1200;
const MAX_SCALE = 2;

const HELP = `diagrams-hub — check Mermaid / Excalidraw diagram code and render it to a PNG you can look at.

QUICK START — this is all you need
  ${SELF} render diagram.mmd

  OK    -> prints "image: /absolute/path/diagram.png". Open/read that PNG to see the diagram.
  ERROR -> prints the problem with line, column and the source lines around it. Fix the code
           and run the same command again.

  Needs only Node.js 20+ (or Bun) and an installed Chrome, Edge or Chromium — on WSL the
  Windows Edge/Chrome is used automatically. No npm install, no build, no setup: the
  renderer ships prebuilt. Do not install bun, playwright, npm packages or browsers, and
  do not try to repair this tool: if it exits with code 2, tell the user its message.

COLORS — consistent and modern by default (style soft, palette modern)
  Choose with comment lines in the diagram code (preferred: the look stays with the diagram,
  also in the web app), or with --style / --palette:
    %% style: soft         light fill + darker border in the same color (Excalidraw-like)
    %% style: solid        strong color fill, white text
    %% style: outline      colored border only, no fill
    %% palette: modern     indigo, teal, amber, rose, sky, violet, emerald
    %% palette: ocean      blue, cyan, teal, indigo, sky
    %% palette: sunset     orange, rose, amber, fuchsia, red
    %% palette: forest     emerald, teal, lime, green, cyan
    %% palette: berry      violet, fuchsia, pink, indigo, rose
    %% palette: mono       slate (grayscale)
  Groups (flowchart subgraph, class namespace, architecture group) take the palette's
  colors in order and nodes inside a group take its color — so use groups to color-code.
  Nodes outside groups use the first color. Don't hand-pick colors with classDef/style
  unless asked; explicit styles are kept as written.

COMMANDS
  render [FILE|-]   Check the diagram and render it to PNG (default command)
  check  [FILE|-]   Only check the syntax, no image
  icons  [FILTER]   List icon names usable in architecture-beta, e.g. "icons database"
  setup             Optional: check that rendering works and show which browser is used
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
  -s, --style NAME     soft | solid | outline (a %% style: line in the code wins)
  -p, --palette NAME   modern | ocean | sunset | forest | berry | mono (%% palette: wins)
  -t, --theme FILE     Colors/fonts as JSON (the web app's Style panel -> "Copy JSON");
                       partial themes work: {"colors": {"clusterBkg": "#eef2f7"}}
      --svg PATH       Also write the SVG
      --json           Machine-readable result on stdout:
                       {"ok", "mode", "look", "image", "svg", "width", "height", "error", "warnings"},
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

// Keep in sync with LOOK_STYLES / PALETTES in src/lib/utils/looks.ts (and the COLORS help above)
const STYLES = ['soft', 'solid', 'outline'];
const PALETTES = ['modern', 'ocean', 'sunset', 'forest', 'berry', 'mono'];

function choice(flag, value, allowed) {
  const v = value.toLowerCase();
  if (!allowed.includes(v)) throw new UsageError(`${flag} must be one of: ${allowed.join(', ')}`);
  return v;
}
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
      case '-s': case '--style': opts.style = choice(arg, value(), STYLES); break;
      case '-p': case '--palette': opts.palette = choice(arg, value(), PALETTES); break;
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

// ── Renderer page + local server ────────────────────────────────────────────

const log = (msg) => process.stderr.write(`diagrams-hub: ${msg}\n`);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json',
};

/**
 * Serve the committed renderer build plus one job: the page fetches `/job`
 * and posts its answer to `/result`. `contacted` resolves on the first request
 * (the browser is up and can reach us), `result` on the answer.
 */
function serveJob(job) {
  let onContact, onResult;
  const contacted = new Promise((ok) => (onContact = ok));
  const result = new Promise((ok) => (onResult = ok));
  const server = createServer((req, res) => {
    onContact();
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (path === '/job') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(job));
      return;
    }
    if (path === '/result' && req.method === 'POST') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        res.writeHead(200).end('ok');
        try {
          onResult(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (err) {
          onResult({ failure: `unreadable result from the renderer page: ${err.message}` });
        }
      });
      return;
    }
    const file = resolve(RENDERER_DIR, '.' + (path === '/' ? '/render.html' : path));
    if (!file.startsWith(RENDERER_DIR) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((ok, fail) => {
    server.on('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port, contacted, result }));
  });
}

// ── Browser ─────────────────────────────────────────────────────────────────
//
// No Playwright and no DevTools connection: any Chrome/Edge/Chromium is started
// headless with the renderer URL and exits by itself once the page has posted
// its result. That also works with the Windows browser from inside WSL (always
// present there as Edge), where Linux Chromium usually lacks system libraries.

const IS_WSL = process.platform === 'linux' &&
  (!!process.env.WSL_DISTRO_NAME || /microsoft/i.test(release()));

/** Where WSL mounts the Windows drives (/mnt unless changed in /etc/wsl.conf) */
function wslMountRoot() {
  try {
    const m = /^\s*root\s*=\s*(\S+)/m.exec(readFileSync('/etc/wsl.conf', 'utf8'));
    if (m) return m[1].replace(/\/+$/, '');
  } catch {
    // no wsl.conf
  }
  return '/mnt';
}

function onPath(names) {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  return names.flatMap((n) => dirs.map((d) => join(d, n))).filter((p) => existsSync(p));
}

/** `base/<a>/<b>/...` with `*` segments matched against directory entries */
function glob(base, ...segments) {
  let paths = [base];
  for (const seg of segments) {
    paths = paths.flatMap((p) => {
      if (!seg.includes('*')) return [join(p, seg)];
      const re = new RegExp('^' + seg.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      try {
        return readdirSync(p).filter((e) => re.test(e)).sort().reverse().map((e) => join(p, e));
      } catch {
        return [];
      }
    });
  }
  return paths.filter((p) => existsSync(p));
}

/** Browsers downloaded earlier by Playwright (used if present, never downloaded) */
function playwrightBrowsers() {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (process.platform === 'darwin' ? join(homedir(), 'Library/Caches/ms-playwright')
      : process.platform === 'win32' ? join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
        : join(homedir(), '.cache/ms-playwright'));
  return [
    ...glob(cache, 'chromium-*', 'chrome-*', 'chrome'),
    ...glob(cache, 'chromium-*', 'chrome-*', 'chrome.exe'),
    ...glob(cache, 'chromium-*', 'chrome-mac*', 'Chromium.app/Contents/MacOS/Chromium'),
    ...glob(cache, 'chromium_headless_shell-*', 'chrome-*', 'chrome-headless-shell'),
    ...glob(cache, 'chromium_headless_shell-*', 'chrome-*', 'headless_shell'),
    ...glob(cache, 'chromium_headless_shell-*', 'chrome-*', 'chrome-headless-shell.exe'),
  ];
}

const WINDOWS_BROWSERS = [
  'Google/Chrome/Application/chrome.exe',
  'Microsoft/Edge/Application/msedge.exe',
  'BraveSoftware/Brave-Browser/Application/brave.exe',
];

/** Candidates in the order they are tried: { name, path, windows } */
function browserCandidates() {
  const explicit = process.env.DIAGRAMS_HUB_CHROMIUM;
  if (explicit) return [{ path: explicit, windows: IS_WSL && /\.exe$/i.test(explicit) }];

  const list = [];
  const add = (path, windows = false) => {
    if (path && !list.some((c) => c.path === path)) list.push({ path, windows });
  };

  const cached = readCachedBrowser();
  if (cached && existsSync(cached.path)) add(cached.path, cached.windows);

  if (process.platform === 'darwin') {
    for (const app of ['Google Chrome', 'Microsoft Edge', 'Chromium', 'Brave Browser']) {
      add(existsSync(`/Applications/${app}.app`) ? `/Applications/${app}.app/Contents/MacOS/${app}` : null);
    }
  } else if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    for (const b of WINDOWS_BROWSERS) for (const r of roots) add(existsSync(join(r, b)) ? join(r, b) : null);
  } else {
    const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge',
      'microsoft-edge-stable', 'brave-browser'];
    for (const p of [...onPath(names), '/opt/google/chrome/chrome', '/snap/bin/chromium']) add(existsSync(p) ? p : null);
  }
  for (const p of playwrightBrowsers()) add(p, p.endsWith('.exe') && IS_WSL);

  if (IS_WSL) {
    const c = `${wslMountRoot()}/c`;
    const roots = [`${c}/Program Files`, `${c}/Program Files (x86)`, ...glob(`${c}/Users`, '*', 'AppData/Local')];
    for (const b of WINDOWS_BROWSERS) for (const r of roots) add(existsSync(join(r, b)) ? join(r, b) : null, true);
  }
  return list;
}

const BROWSER_CACHE = join(ROOT, '.cli-cache', 'browser.json');

function readCachedBrowser() {
  try {
    return JSON.parse(readFileSync(BROWSER_CACHE, 'utf8'));
  } catch {
    return null;
  }
}

function cacheBrowser(candidate) {
  try {
    mkdirSync(dirname(BROWSER_CACHE), { recursive: true });
    writeFileSync(BROWSER_CACHE, JSON.stringify(candidate));
  } catch {
    // only an optimization
  }
}

/** A fresh browser profile dir: { arg, cleanup } (Windows browsers need a Windows path) */
function profileDir(windows) {
  const name = `diagrams-hub-${process.pid}-${randomBytes(4).toString('hex')}`;
  if (windows) {
    const temp = spawnSync('cmd.exe', ['/d', '/c', 'echo %TEMP%'], {
      cwd: existsSync(`${wslMountRoot()}/c`) ? `${wslMountRoot()}/c` : undefined, // no UNC-path warning
      encoding: 'utf8',
    }).stdout?.trim();
    const local = temp && spawnSync('wslpath', ['-u', temp], { encoding: 'utf8' }).stdout?.trim();
    if (!temp || !local) throw new Error('could not find the Windows TEMP folder (cmd.exe / wslpath not usable)');
    return { arg: `${temp}\\${name}`, cleanup: () => rmSync(join(local, name), { recursive: true, force: true }) };
  }
  const dir = join(tmpdir(), name);
  return { arg: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const CONTACT_TIMEOUT = 20000;
const RESULT_TIMEOUT = 90000;

/** Start one browser on the job; resolves with the page's answer or rejects with a short reason */
async function runInBrowser(candidate, job) {
  const { server, port, contacted, result } = await serveJob(job);
  const profile = profileDir(candidate.windows);
  // A Windows browser reaches the WSL server through WSL's localhost forwarding
  const url = `http://${candidate.windows ? 'localhost' : '127.0.0.1'}:${port}/render.html?job`;
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-sync', '--disable-background-networking', '--disable-component-update', '--mute-audio',
    '--hide-scrollbars', '--window-size=1600,1200', `--user-data-dir=${profile.arg}`,
    ...(candidate.windows || process.platform === 'win32' ? [] : ['--no-sandbox']),
    url,
  ];
  const child = spawn(candidate.path, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-4000)));
  const exited = new Promise((ok) => child.on('close', ok));
  const failed = new Promise((ok) => child.on('error', ok));

  let timer;
  const timeout = (ms, what) => new Promise((_, fail) => (timer = setTimeout(() => fail(new Error(what)), ms)));
  const died = Promise.race([exited, failed]).then((why) => {
    const detail = stderr.split('\n').map((l) => l.trim()).filter((l) => /error|fail|cannot|not found/i.test(l)).pop();
    throw new Error(why instanceof Error ? why.message : `exited early (${detail ?? `code ${why}`})`);
  });
  died.catch(() => {}); // it also "fails" when the browser exits normally after answering
  try {
    await Promise.race([contacted, died, timeout(CONTACT_TIMEOUT, 'did not load the renderer page')]);
    clearTimeout(timer);
    const answer = await Promise.race([result, died, timeout(RESULT_TIMEOUT, 'renderer page timed out')]);
    if (answer.failure) throw new Error(`renderer page failed: ${answer.failure}`);
    return answer;
  } finally {
    clearTimeout(timer);
    // The page closes itself, which ends the browser; kill it if it doesn't
    await Promise.race([exited, new Promise((ok) => setTimeout(ok, 3000))]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    server.close();
    try {
      profile.cleanup();
    } catch {
      // the browser may still hold files for a moment; it's only a temp dir
    }
  }
}

/** Run a job in the first browser that works, remembering it for next time */
async function runJob(job) {
  if (!existsSync(join(RENDERER_DIR, 'render.html'))) {
    throw new EnvError(`The renderer build is missing (${RENDERER_DIR}). This checkout is incomplete; ` +
      'the user should re-clone or `git pull` the diagrams-hub repo. Do not try to build or install anything.');
  }
  const candidates = browserCandidates();
  const failures = [];
  for (const candidate of candidates) {
    try {
      const answer = await runInBrowser(candidate, job);
      if (readCachedBrowser()?.path !== candidate.path) cacheBrowser(candidate);
      return { ...answer, browser: candidate.path };
    } catch (err) {
      failures.push(`${candidate.path}: ${firstLine(err)}`);
      if (candidates.length > 1) log(`browser ${candidate.path} did not work (${firstLine(err)}), trying the next one`);
    }
  }
  throw new EnvError(
    'No usable Chrome/Edge/Chromium found to render with. This needs the user, not more installs by an agent ' +
    '(do not install playwright, bun or browsers):\n' +
    '  - install Google Chrome or Microsoft Edge, or set DIAGRAMS_HUB_CHROMIUM=/path/to/chrome\n' +
    (IS_WSL ? '  - on WSL the Windows Edge/Chrome under /mnt/c is used; that needs WSL interop (running .exe files)\n' +
      '    and localhost forwarding (both on by default)\n' : '') +
    (failures.length ? `Tried:\n  ${failures.join('\n  ')}` : 'No browser was found at the usual locations.'),
  );
}

function firstLine(err) {
  return String(err?.message ?? err).split('\n').find((l) => l.trim()) ?? 'unknown error';
}

// ── Commands ────────────────────────────────────────────────────────────────

function defaultImagePath(opts, code) {
  if (opts.input && opts.input !== '-') return opts.input.replace(/\.[^./\\]+$/, '') + '.png';
  const hash = createHash('sha1').update(code).digest('hex').slice(0, 10);
  return join(tmpdir(), 'diagrams-hub', `diagram-${hash}.png`);
}

async function renderCode(code, opts) {
  const theme = loadTheme(opts.theme);
  const look = { ...(opts.style && { style: opts.style }), ...(opts.palette && { palette: opts.palette }) };
  const { result, png, svg } = await runJob({
    command: opts.command === 'check' ? 'check' : 'render',
    code, theme, look, maxSize: opts.maxSize, maxScale: MAX_SCALE, svg: !!opts.svg,
  });
  const output = {
    ok: !result.error,
    mode: result.mode,
    image: null,
    svg: null,
    width: 0,
    height: 0,
    look: result.look,
    error: result.error,
    warnings: result.warnings,
  };
  if (result.error || opts.command === 'check') return output;

  if (opts.svg) {
    mkdirSync(dirname(resolve(opts.svg)), { recursive: true });
    writeFileSync(opts.svg, svg);
    output.svg = resolve(opts.svg);
  }
  const image = resolve(opts.out ?? defaultImagePath(opts, code));
  mkdirSync(dirname(image), { recursive: true });
  writeFileSync(image, Buffer.from(png, 'base64'));
  return { ...output, image, width: result.width, height: result.height };
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
    const look = out.look ? `, style ${out.look.style}, palette ${out.look.palette}` : '';
    lines.push(`OK (${out.mode}${look}) rendered ${out.width}x${out.height}px`, `image: ${out.image}`);
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
      const { browser } = await runJob({ command: 'check', code: 'flowchart LR\n  a --> b' });
      process.stdout.write(`OK ready — rendering with ${browser}. Next: ${SELF} render FILE\n`);
      return 0;
    }

    case 'icons': {
      const { icons: all } = await runJob({ command: 'icons' });
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
