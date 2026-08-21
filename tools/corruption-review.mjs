/**
 * The three reads DL_HERO_CORRUPTION_SPEC.md asks for, on the real GPU.
 *
 *   landing  - one strange diagonal blemish, easy to miss
 *   mid      - it resolves into an irregular diseased brush band
 *   close    - broken claw-memory currents and sparse particles
 *
 * Also reports the two numbers the spec's acceptance list can actually
 * be measured against: the share of affected pixels that are emissive,
 * and whether the effect survives with emission disabled. Everything
 * else on that list is Jacob's eye, not a number.
 */
import { launch, captures, BASE } from './env.mjs';

const OUT = captures('corruption');
const W = 2270;
const H = 1278;

const b = await launch(['--hide-scrollbars']);
const p = await b.newPage({ viewport: { width: W, height: H } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));

await p.goto(BASE + '/', { waitUntil: 'networkidle' });
await p.mouse.move(W / 2, H / 2);
await p.waitForTimeout(4000);

const STOPS = [
  ['landing', 0.0],
  ['mid', 0.30],
  ['close', 0.43]
];

for (const [name, frac] of STOPS) {
  await p.evaluate((f) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, max * f);
  }, frac);
  // the pursuit filter follows input, so give it real frames to arrive
  await p.waitForTimeout(3500);
  await p.screenshot({ path: OUT + '/' + name + '.png' });
  console.log('captured', name, 'at progress', frac);
}

// emissive share across the hero, which the spec caps at about 5%
const stat = await p.evaluate(() => new Promise((res) => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const s = document.getElementById('world');
    const c = document.createElement('canvas');
    c.width = s.width; c.height = s.height;
    const x = c.getContext('2d');
    x.drawImage(s, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let lit = 0, bright = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      if (l > 0.035) lit++;
      if (l > 0.62) bright++;
    }
    res({ lit, bright, share: +(bright / Math.max(lit, 1)).toFixed(4) });
  }));
}));
console.log('close read: lit px', stat.lit, ' bright px', stat.bright,
            ' emissive share', stat.share);
console.log(errs.length ? 'CONSOLE ERRORS:\n' + errs.join('\n') : 'console clean');
await b.close();
