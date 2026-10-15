// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);

function crossings(xml) {
  const dv = /<divisions>(\d+)<\/divisions>/.exec(xml);
  const div = dv ? +dv[1] : 1;
  let total = 0, cross = 0;
  xml.split(/<measure[ >]/).slice(1).forEach(m => {
    let t = 0;
    [...m.matchAll(/<note[\s\S]*?<\/note>/g)].forEach(tag => {
      const du = /<duration>(\d+)<\/duration>/.exec(tag);
      const d = du ? +du[1] : 0;
      if (d > 0) {
        const start = t / div, end = (t + d) / div;
        total++;
        const startsOnBeat = Math.abs(start - Math.round(start)) < 1e-6;
        if (Math.floor(start + 1e-6) !== Math.floor(end - 1e-6) && !(startsOnBeat && Number.isInteger(end))) cross++;
      }
      t += d;
    });
  });
  return total + ' notes, ' + cross + ' crossing';
}

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8091/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  await p.evaluate(() => {
    const P = window.osme.OpenSheetMusicDisplay.prototype, o = P.load;
    P.load = function (x) { window.__xml = x; return o.apply(this, arguments); };
  });
  // Which cells are showing is measured from their boxes, not their attributes
  // — a cell inside a hidden family is not itself marked hidden — so the panel
  // has to actually be open for any of it to have a size.
  await p.evaluate(() => {
    const ob = document.getElementById('ob'); if (ob) ob.hidden = true;
    document.getElementById('settings-toggle').click();
  });
  await p.waitForTimeout(900);

  // Meter is a set now, so "pick 3/4" means turn 3/4 on and everything else
  // off — and in that order, since the control clamps at one and would refuse
  // to empty itself. Clicked the way a person would, but without Playwright's
  // actionability wait (the panel may be closed and the cell off-screen).
  const meter = m => p.evaluate(x => {
    const cells = [...document.querySelectorAll('#timesig-pills .fig-cell')];
    const want = cells.find(e => e.textContent.trim() === x);
    if (want && !want.classList.contains('on')) want.click();
    cells.forEach(c => { if (c !== want && c.classList.contains('on')) c.click(); });
  }, m);
  // Families replaced groups: one grid per simple/compound, headed by the
  // meters that selected it.
  const state = () => p.evaluate(() => ({
    groups: [...document.querySelectorAll('#beats .fig-fam')]
      .map(g => g.dataset.fam + (g.getBoundingClientRect().height > 0 ? ':shown' : ':hidden')),
    inPlay: [...document.querySelectorAll('#beats .fig-cell .beat:checked')]
      .filter(c => c.closest('.fig-cell').getBoundingClientRect().width > 0).map(c => c.value),
    headsVisible: [...document.querySelectorAll('#beats .fig-h')]
      .filter(h => h.getBoundingClientRect().height > 0).length
  }));

  await p.evaluate(() => {
    const want = ['eqe', 'dqe', 'edq', 'req'];
    document.querySelectorAll('#beats .beat').forEach(cb => {
      const should = want.indexOf(cb.value) >= 0;
      if (cb.checked !== should) { cb.checked = should; cb.dispatchEvent(new Event('change')); }
    });
  });
  await p.waitForTimeout(1800);

  for (const m of ['4/4', '3/4', '2/4', '4/4', '6/8']) {
    await meter(m); await p.waitForTimeout(1700);
    const s = await state();
    console.log(m.padEnd(4), JSON.stringify(s.groups).padEnd(34),
      'heads:' + s.headsVisible,
      'inPlay:' + JSON.stringify(s.inPlay).padEnd(34),
      crossings(await p.evaluate(() => window.__xml)));
  }
  console.log('errors:', errs);
  await b.close();
})();
