// Shared environment for the capture and review tools.
//
// Three things used to be written into every tool as one machine's absolute
// paths: where playwright lives, where captures are written, and whether
// Chrome runs headed. That made the whole toolbox unrunnable anywhere except
// C:/Users/jacob. Each tool now imports these from here instead.
//
// Headed Chrome on the real GPU stays the default wherever a display exists.
// Headless is not GPU truth and nothing here pretends otherwise: on a box
// with no display the tools fall back to headless with a software GL
// backend, which is enough to diagnose geometry, draw order, composition and
// layout, and is NOT enough to judge tone, bloom or grade.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The dev server. Tools that drive a second instance override DL_BASE. */
export const BASE = process.env.DL_BASE || 'http://localhost:5180';

/**
 * captures/<sub> inside this checkout, created if absent. On Jacob's PC this
 * resolves to the same directory the absolute paths used to name.
 * captures/ is gitignored; nothing written here is committed.
 */
export function captures(sub = '') {
  const dir = sub ? join(REPO, 'captures', sub) : join(REPO, 'captures');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** A path inside the checkout, for the few tools that write shipped assets. */
export function repoPath(...parts) {
  return join(REPO, ...parts);
}

// --- playwright -------------------------------------------------------------
// Deliberately not a dependency of this repo: the site ships no test deps and
// nothing in the build needs a browser. Borrow it, in this order: an explicit
// override, this checkout, the sibling dark-lattice checkout it has always
// been borrowed from, then a global install.
function globalRoot() {
  try {
    return execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function loadChromium() {
  const bases = [];
  if (process.env.DL_PLAYWRIGHT) {
    bases.push(
      process.env.DL_PLAYWRIGHT.endsWith('package.json')
        ? process.env.DL_PLAYWRIGHT
        : join(process.env.DL_PLAYWRIGHT, 'package.json')
    );
  }
  bases.push(join(REPO, 'package.json'));
  bases.push(resolve(REPO, '..', 'dark-lattice', 'package.json'));
  const g = globalRoot();
  if (g) bases.push(join(g, 'playwright', 'package.json'));

  const tried = [];
  for (const base of bases) {
    try {
      return createRequire(base)('playwright').chromium;
    } catch {
      tried.push(base);
    }
  }
  throw new Error(
    'playwright not found. Install it globally (npm i -g playwright), or set\n' +
      'DL_PLAYWRIGHT to a checkout that has it. Looked from:\n  ' +
      tried.join('\n  ')
  );
}

export const chromium = loadChromium();

// --- how Chrome runs --------------------------------------------------------
/** Headed on a real display; DL_HEADLESS=1 forces headless, DL_HEADLESS=0 forces headed. */
export const HEADED =
  process.env.DL_HEADLESS !== undefined
    ? process.env.DL_HEADLESS === '0'
    : process.platform === 'win32' ||
      process.platform === 'darwin' ||
      Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);

/** True when frames come from a software rasteriser, so tone is not to be trusted. */
export const SOFTWARE = !HEADED;

// Under software GL a frame can take the better part of a second, and
// playwright's 30s default expires mid-screenshot waiting for a stable one.
// Wrapping newPage/newContext is the only hook playwright offers to give
// every page a patient default there and the stock one on a real GPU.
const ACTION_TIMEOUT = SOFTWARE ? 240_000 : 30_000;

function patient(browser) {
  return new Proxy(browser, {
    get(target, prop) {
      // Read and bind against the real browser, never the proxy: playwright
      // uses private fields, and a getter or method running with the proxy as
      // `this` throws on them.
      const value = target[prop];
      if (prop !== 'newPage' && prop !== 'newContext') {
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return async (...args) => {
        const made = await value.apply(target, args);
        made.setDefaultTimeout(ACTION_TIMEOUT);
        if (prop === 'newContext') {
          const inner = made.newPage.bind(made);
          made.newPage = async (...a) => {
            const page = await inner(...a);
            page.setDefaultTimeout(ACTION_TIMEOUT);
            return page;
          };
        }
        return made;
      };
    }
  });
}

/**
 * Launch the review browser. Extra args are appended, so a tool that needs a
 * flag of its own keeps it.
 */
export async function launch(extraArgs = []) {
  const args = ['--hide-scrollbars', ...extraArgs];
  if (SOFTWARE) {
    args.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist');
  }
  const browser = await chromium.launch({ headless: !HEADED, args });
  if (SOFTWARE) {
    console.log('[env] software GL, headless: geometry and layout are readable, tone is not.');
  }
  return patient(browser);
}
