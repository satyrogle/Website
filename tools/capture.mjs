// Smoke capture of the genesis build (localhost:5180), headed Chrome on
// the real GPU where there is one: headless is not GPU truth. See tools/env.mjs.
//   node tools/capture.mjs
//
// Produces: desktop frames for every stop, a flat static-frame audit,
// a mobile pass, and the real still used by the WebGL fallback.
import { BASE, SOFTWARE, captures, launch, repoPath } from './env.mjs';

const OUT = captures();
// The shipped fallback still is a real capture of this world on a real GPU,
// and the ledger says so. A software rasteriser must never be allowed to
// overwrite it, so off-GPU the still goes to captures/ for comparison only.
const STILL = SOFTWARE ? OUT + '/13-still-SOFTWARE-NOT-SHIPPABLE.jpg' : repoPath('public', 'still', 'world.jpg');

const browser = await launch();

async function stats(page, label) {
  const s = await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const src = document.getElementById('world');
            const c = document.createElement('canvas');
            c.width = 200;
            c.height = 120;
            const ctx = c.getContext('2d');
            ctx.drawImage(src, 0, 0, 200, 120);
            const d = ctx.getImageData(0, 0, 200, 120).data;
            let a5 = 0, a40 = 0, a80 = 0, max = 0, sum = 0;
            const n = 200 * 120;
            for (let i = 0; i < n; i++) {
              const l = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
              sum += l;
              if (l > max) max = l;
              if (l > 0.05) a5++;
              if (l > 0.4) a40++;
              if (l > 0.8) a80++;
            }
            resolve({
              mean: +(sum / n).toFixed(4),
              max: +max.toFixed(3),
              pctAbove5: +((100 * a5) / n).toFixed(1),
              pctAbove40: +((100 * a40) / n).toFixed(1),
              pctAbove80: +((100 * a80) / n).toFixed(2)
            });
          })
        );
      })
  );
  console.log(label, JSON.stringify(s));
}

// ---------- desktop journey ----------
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4500);

  await stats(page, 'OPENING');
  await page.screenshot({ path: OUT + '/01-opening.png' });

  await page.mouse.click(1100, 620);
  await page.waitForTimeout(900);
  console.log(
    'NEWEST RECORD',
    await page.evaluate(() => (document.querySelector('#record-list li') || {}).textContent || 'EMPTY')
  );
  await page.screenshot({ path: OUT + '/02-mark.png' });

  for (const [id, name, wait] of [
    ['system', '03-system', 2200],
    ['desk42', '04-desk42', 2200],
    ['rule', '05-rule', 2500],
    ['brawler', '06-brawler', 2200],
    ['technology', '07-micro', 3000],
    ['studio', '08-studio', 2200],
    ['contact', '09-return', 3200]
  ]) {
    await page.evaluate((sel) => document.getElementById(sel).scrollIntoView({ block: 'start' }), id);
    await page.waitForTimeout(wait);
    await stats(page, name.toUpperCase());
    await page.screenshot({ path: OUT + '/' + name + '.png' });
  }

  console.log(
    'LEDGER',
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('#record-list li')).map((li) => li.textContent)
    )
  );
  await page.close();
}

// ---------- flat static-frame audit (bloom, atmosphere, grain off) ----------
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(BASE + '/?flat=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4500);
  await stats(page, 'FLAT-OPENING');
  await page.screenshot({ path: OUT + '/10-flat-opening.png' });
  await page.close();
}

// ---------- the fallback still: the world alone ----------
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(BASE + '/?bare=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: STILL, type: 'jpeg', quality: 62 });
  console.log(SOFTWARE ? 'STILL held back: software render, ' + STILL : 'STILL exported to public/still/world.jpg');
  await page.close();
}

// ---------- mobile recomposition ----------
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await stats(page, 'MOBILE-OPENING');
  await page.screenshot({ path: OUT + '/11-mobile-opening.png' });
  await page.evaluate(() => document.getElementById('technology').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT + '/12-mobile-ledger.png' });
  await page.close();
}

await browser.close();
console.log('DONE');
