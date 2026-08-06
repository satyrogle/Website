import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});

// ---- overflow at 360 -------------------------------------------------
{
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);

  const info = await page.evaluate(() => {
    const doc = document.documentElement;
    const out = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > doc.clientWidth + 0.5) {
        out.push({
          sel: `${el.tagName.toLowerCase()}.${String(el.className).split(' ').filter(Boolean).join('.')}`.slice(0, 60),
          right: Math.round(r.right),
          width: Math.round(r.width),
          left: Math.round(r.left),
          position: getComputedStyle(el).position,
        });
      }
    });
    return {
      innerWidth: window.innerWidth,
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      visualViewport: window.visualViewport
        ? { w: window.visualViewport.width, scale: window.visualViewport.scale }
        : null,
      offenders: out.slice(0, 12),
    };
  });
  console.log('=== 360px overflow ===');
  console.log(JSON.stringify(info, null, 2));
  await ctx.close();
}

// ---- no-JS narrative -------------------------------------------------
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    javaScriptEnabled: false,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      chars: text.length,
      hasDark: text.includes('Dark'),
      hasLattice: text.includes('Lattice'),
      hasBoundary: text.includes('What we do not claim'),
      hasSupported: text.includes('What the evidence supports'),
      ledgerRows: document.querySelectorAll('.ledger tbody tr').length,
      ledgerVisible: getComputedStyle(document.querySelector('.ledger')).display,
      detailsOpen: document.querySelector('details')?.open,
      first120: text.slice(0, 120).replace(/\s+/g, ' '),
    };
  });
  console.log('=== no-JS narrative ===');
  console.log(JSON.stringify(info, null, 2));
  await ctx.close();
}

await browser.close();
