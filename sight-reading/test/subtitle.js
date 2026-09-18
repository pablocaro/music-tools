// The subtitle is the sheet's own facts — keys, meters, bars — and each one is
// a picker. Keys and meters are SETS that rotate: tick C, G and Am and the
// next sheet is in G, the one after in Am, then C again. Checked through the
// Generate button because that is the only thing that advances the rotation;
// a slider nudge regenerates the same sheet in the same key, and the test
// pins that too, since "every regeneration rotates" would make the bars
// slider change your key.
//
// Also: the panel's key row shows the same set, the subtitle folds past six
// keys into "+N", and a saved drill carries both sets through a reload.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);
const { newDrill, pickDrill, setKeys } = require('./drills.js');

let fails = 0;
const check = (label, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (got != null ? '  ' + got : ''));
  if (!ok) fails++;
};

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8091/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  for (let i = 0; i < 4; i++) {
    if (await p.$('#ob-next')) { await p.click('#ob-next').catch(() => {}); await p.waitForTimeout(200); }
  }
  await p.waitForTimeout(800);

  const state = () => p.evaluate(() => ({
    sub: document.getElementById('sh-sub').textContent.trim(),
    now: [...document.querySelectorAll('#sh-sub .sub-part.now')].map((e) => e.textContent.trim()),
    keys: document.getElementById('keys').value,
    tonic: document.getElementById('key-tonic').value,
    mode: document.getElementById('key-mode').value,
    sigs: document.getElementById('timesig').value,
    cycle: document.getElementById('keys-cycle').textContent.trim(),
    title: document.getElementById('sh-title').textContent.trim(),
    kicker: document.getElementById('pick-instr').textContent.trim(),
  }));
  const gen = async () => { await p.click('#generate'); await p.waitForTimeout(1300); return state(); };

  // ---- 1. what the header holds ----
  let s = await state();
  check('kicker names the instrument', s.kicker.length > 0, s.kicker);
  check('subtitle is key · meter · bars', /^C · 4\/4 · \d+ bars$/.test(s.sub), s.sub);
  check('old key cycles are gone', await p.evaluate(() =>
    !document.getElementById('tonic-cycle') && !document.getElementById('mode-cycle') && !document.querySelector('.sec-instrument')));

  // ---- 2. the key picker: two columns, fifths order, C and Am both listed ----
  await p.click('#sh-sub .pick[data-pick="keys"]');
  await p.waitForTimeout(250);
  const menu = await p.evaluate(() => {
    const m = document.getElementById('pick-menu');
    const r = m.getBoundingClientRect();
    return {
      w: Math.round(r.width),
      heads: [...m.querySelectorAll('.pick-h')].map((e) => e.textContent.trim()),
      items: [...m.querySelectorAll('.menu-item')].map((e) => e.textContent.replace(/[●\s]/g, '')),
      marked: [...m.querySelectorAll('.menu-item.now')].map((e) => e.textContent.replace(/[●\s]/g, '')),
      literal: !!m.textContent.match(/u25cf/),
    };
  });
  await p.keyboard.press('Escape');
  check('two columns, Major and Minor', menu.heads.join('/') === 'Major/Minor', menu.heads.join('/'));
  check('24 keys, C and Am both present', menu.items.length === 24 && menu.items.indexOf('C') >= 0 && menu.items.indexOf('Am') >= 0, menu.items.length + ' items');
  check('menu sized to its content, not the viewport', menu.w > 150 && menu.w < 400, menu.w + 'px');
  check('this sheet\'s key carries the ● marker', menu.marked.join() === 'C' && !menu.literal, menu.marked.join());

  // ---- 3. rotation: C, G, Am → advances on Generate, and only then ----
  const clicks = await setKeys(p, ['C', 'G', 'Am']);
  s = await state();
  check('set is C, G, Am in fifths order (' + clicks + ' picks)', s.keys === 'major_0-0,major_4-0,minor_5-0', s.keys);
  check('first sheet after a set change is the first key', s.tonic === '0-0' && s.mode === 'major', s.tonic + '/' + s.mode);
  check('panel key row shows the set', s.cycle === 'C, G, Am', s.cycle);
  const seq = [];
  for (let i = 0; i < 4; i++) { s = await gen(); seq.push(s.now[0] + ':' + s.tonic + '/' + s.mode); }
  check('Generate rotates C → G → Am → C', seq.join(' ') === 'G:4-0/major Am:5-0/minor C:0-0/major G:4-0/major', seq.join(' '));
  await p.evaluate(() => {
    const m = document.getElementById('measures');
    m.value = 8; m.dispatchEvent(new Event('input', { bubbles: true })); m.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(1300);
  s = await state();
  check('a slider regeneration keeps the key', s.tonic === '4-0' && /8 bars/.test(s.sub), s.tonic + ' ' + s.sub);

  // ---- 4. meters rotate alongside ----
  await p.click('#sh-sub .pick[data-pick="sigs"]');
  await p.waitForTimeout(250);
  await p.evaluate(() => {
    const it = [...document.querySelectorAll('#pick-menu .menu-item')].find((e) => e.textContent.replace(/[●\s]/g, '') === '3/4');
    it.click();
  });
  await p.waitForTimeout(1300);
  await p.keyboard.press('Escape');
  s = await state();
  check('meter set is 3/4, 4/4', s.sigs === '3/4,4/4', s.sigs);
  const mseq = [];
  for (let i = 0; i < 4; i++) { s = await gen(); mseq.push(s.now[1]); }
  check('meters alternate sheet to sheet', mseq.join(' ') === '4/4 3/4 4/4 3/4' || mseq.join(' ') === '3/4 4/4 3/4 4/4', mseq.join(' '));

  // ---- 5. past six keys the subtitle folds ----
  await setKeys(p, ['C', 'G', 'D', 'A', 'E', 'B', 'Am', 'Em']);
  s = await state();
  check('eight keys read as six +2', /^C, G, D, A, E, B \+2 · /.test(s.sub), s.sub);
  check('panel row still lists every key', s.cycle.split(', ').length === 8, s.cycle);

  // ---- 6. a drill saves both sets and they survive a reload ----
  await newDrill(p, 'Rotator');
  const row = await p.evaluate(() => {
    const r = [...document.querySelectorAll('#presets .drill')].find((e) => e.querySelector('.drill-name').textContent.trim().startsWith('Rotator'));
    return r ? r.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  check('band row summarises both sets', /3\/4, 4\/4/.test(row) && /C, G, D/.test(row), row);
  await pickDrill(p, 'Steps Only');
  s = await state();
  check('Steps Only is back to C · 4/4', s.keys === 'major_0-0' && s.sigs === '4/4', s.keys + ' ' + s.sigs);
  const via = await pickDrill(p, 'Rotator');
  s = await state();
  check('Rotator restores the sets (' + via + ')', s.keys.split(',').length === 8 && s.sigs === '3/4,4/4' && s.title === 'Rotator', s.keys);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  s = await state();
  check('after reload', s.keys.split(',').length === 8 && s.sigs === '3/4,4/4' && s.title === 'Rotator', s.sub);

  await p.screenshot({ path: 'sight-reading/test/out/subtitle.png' }).catch(() => p.screenshot({ path: 'test/out/subtitle.png' }));
  check('no page errors', errs.length === 0, JSON.stringify(errs));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
