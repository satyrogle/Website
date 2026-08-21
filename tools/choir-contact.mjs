// Where do the choir masses meet the ground? Crops the contact band at
// three stops, headed Chrome on the real GPU.
//   node tools/choir-contact.mjs
import { captures, launch } from './env.mjs';

const BASE = process.env.DL_BASE || 'http://localhost:5180';
const OUT = captures('contact');

const STOPS = [
  ['a-opening', 0.001],
  ['b-orbit', 0.12],
  ['c-wide', 0.29],
  ['d-return', 0.95]
];

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.mouse.move(8, 8);
await page.waitForTimeout(3500);
// the copy is not what is being reviewed here
await page.addStyleTag({ content: '.hero-copy, header, footer, .ticker, .evidence, nav { opacity: 0 !important; }' });

for (const [name, p] of STOPS) {
  await page.evaluate((prog) => {
    const h = document.body.scrollHeight - window.innerHeight;
    window.scrollTo(0, h * prog);
  }, p);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/${name}-full.png` });
  // the contact band: lower third, where feet should meet plain
  await page.screenshot({
    path: `${OUT}/${name}-band.png`,
    clip: { x: 0, y: 560, width: 1600, height: 340 }
  });
  console.log('captured', name, p);
}

await browser.close();
