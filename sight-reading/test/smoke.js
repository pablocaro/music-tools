// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text().slice(0, 90)); });
  await p.goto('http://localhost:8091/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  console.log('errors:', errs.slice(0, 4));
  // Families replaced groups when the palette split by meter. Read from the
  // hidden attribute, which app.js sets on the family itself: this smoke test
  // never opens the panel, so measuring boxes would report everything hidden
  // and say nothing about which family the meter selected.
  console.log('families:', await p.evaluate(() => [...document.querySelectorAll('#beats .fig-fam')]
    .map(g => g.dataset.fam + (g.hidden ? '(hidden)' : ''))));
  console.log('cells :', await p.evaluate(() => document.querySelectorAll('#beats .fig-cell').length));
  console.log('wide  :', await p.evaluate(() => document.querySelectorAll('#beats .fig-cell.wide').length));
  console.log('sheet :', await p.evaluate(() => document.querySelectorAll('#sheet .vf-stavenote').length), 'notes');
  await b.close();
})();
