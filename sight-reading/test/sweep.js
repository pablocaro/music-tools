// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('http://localhost:8091/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  for (let i = 0; i < 4; i++) { if (await p.$('#ob-next')) { await p.click('#ob-next').catch(()=>{}); await p.waitForTimeout(200); } }
  await p.click('#settings-toggle'); await p.waitForTimeout(400);
  await p.evaluate(() => { const c = document.getElementById('show-chunks'); if (!c.checked) { c.checked = true; c.dispatchEvent(new Event('change')); } });

  const clickPill = n => p.evaluate(x => [...document.querySelectorAll('.presets .pill')]
    .find(e => e.textContent.trim().startsWith(x)).click(), n);
  const setMeter = m => p.evaluate(x => [...document.querySelectorAll('#timesig-pills .opt')]
    .find(e => e.textContent.trim() === x).click(), m);

  const measure = () => p.evaluate(() => {
    const sheet = document.getElementById('sheet'), cR = sheet.getBoundingClientRect();
    const heads = [...document.querySelectorAll('#sheet .vf-notehead')].map(h => {
      const r = h.getBoundingClientRect();
      return { cx: r.left + r.width/2 - cR.left + sheet.scrollLeft, cy: r.top + r.height/2 - cR.top + sheet.scrollTop };
    });
    const blocks = [...document.querySelectorAll('#chunk-overlay rect')].map(r => {
      const x=+r.getAttribute('x'), y=+r.getAttribute('y'), w=+r.getAttribute('width'), h=+r.getAttribute('height');
      const inside = heads.filter(q => q.cx>x && q.cx<x+w && q.cy>y && q.cy<y+h).sort((a,c)=>a.cx-c.cx);
      const gaps = [];
      for (let i=1;i<inside.length;i++) gaps.push(Math.round(Math.abs(inside[i].cy-inside[i-1].cy)/5));
      return { leap: r.getAttribute('fill') === '#a8e63c', gaps, n: inside.length };
    });
    return { blocks, beams: document.querySelectorAll('#sheet .vf-beam').length, heads: heads.length };
  });

  let bad = 0, mixed = 0, tiny = 0, tot = 0; const grid = [];
  for (const meter of ['4/4', '3/4', '2/4', '6/8']) {
    for (const name of ['Steps Only', 'Thirds Drill', 'Wide Leaps', 'Arpeggios']) {
      await clickPill(name); await p.waitForTimeout(1100);
      await setMeter(meter); await p.waitForTimeout(1100);   // built-ins carry timesig, so re-apply
      const r = await measure();
      r.blocks.forEach(c => {
        tot++;
        if (c.n < 2) tiny++;
        const hasStep = c.gaps.some(g => g === 1), hasLeap = c.gaps.some(g => g >= 2);
        if (hasStep && hasLeap) mixed++;
        if (c.gaps.length && c.leap !== hasLeap) bad++;
      });
      grid.push(`${meter}  ${name.padEnd(13)} ${String(r.heads).padStart(3)} notes  ${String(r.blocks.length).padStart(3)} blocks  ${String(r.beams).padStart(3)} beams`);
    }
  }
  grid.forEach(g => console.log('  ' + g));
  console.log(`TOTAL blocks ${tot} | mixed-interval ${mixed} | miscoloured ${bad} | single-note ${tiny}`);
  console.log('errors:', errs);
  await b.close();
})();
