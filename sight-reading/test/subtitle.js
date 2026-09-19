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
    chips: [...document.querySelectorAll('#sh-sub .pick')].map((e) => e.textContent.trim()),
    chipRows: (() => { const ys = [...document.querySelectorAll('#sh-sub .pick')].map((e) => Math.round(e.getBoundingClientRect().y)); return [...new Set(ys)].length; })(),
    drawnKey: document.getElementById('sheet').dataset.key,
    drawnSig: document.getElementById('sheet').dataset.sig,
    keys: document.getElementById('keys').value,
    tonic: document.getElementById('key-tonic').value,
    mode: document.getElementById('key-mode').value,
    sigs: document.getElementById('timesig').value,
    cycle: document.getElementById('keys-cycle').textContent.trim(),
    title: document.getElementById('sh-title').textContent.trim(),
    kickerPick: !!document.querySelector('.kicker .pick'),
  }));
  const gen = async () => { await p.click('#generate'); await p.waitForTimeout(1300); return state(); };

  // ---- 1. what the header holds ----
  let s = await state();
  check('the wordmark is just the wordmark again', s.kickerPick === false, 'no pick in the kicker');
  check('subtitle is three chips: key, meter, bars',
    s.chips.length === 3 && s.chips[0] === 'C' && s.chips[1] === '4/4' && /^\d+ bars$/.test(s.chips[2]), s.chips.join(' | '));
  check('the chips sit on one row', s.chipRows === 1, s.chipRows + ' row(s)');
  check('a chip is one ink, no brighter rung inside', await p.evaluate(() => {
    const k = document.querySelector('#sh-sub .pick[data-pick="keys"]');
    return !k.querySelector('.sub-part') && k.children.length === 0;
  }), 'keys chip children');
  check('no middot separators survive', await p.evaluate(() =>
    !document.querySelector('#sh-sub .sub-sep') && !/\u00b7/.test(document.getElementById('sh-sub').textContent)), s.sub);
  check('old key cycles are gone', await p.evaluate(() =>
    !document.getElementById('tonic-cycle') && !document.getElementById('mode-cycle')));
  check('the instrument is a panel control, not a wordmark ornament', await p.evaluate(() =>
    !!document.querySelector('.sec-instrument #instr-cycle') && !document.querySelector('.kicker .pick')));

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
  check('no current-key marker survives', menu.marked.length === 0 && !menu.literal, menu.marked.join() || 'none');

  // ---- 3. rotation: C, G, Am → advances on Generate, and only then ----
  const clicks = await setKeys(p, ['C', 'G', 'Am']);
  s = await state();
  check('set is C, G, Am in fifths order (' + clicks + ' picks)', s.keys === 'major_0-0,major_4-0,minor_5-0', s.keys);
  check('first sheet after a set change is the first key', s.tonic === '0-0' && s.mode === 'major', s.tonic + '/' + s.mode);
  check('panel key row shows the set', s.cycle === 'C, G, Am', s.cycle);
  check('three keys need no fold in the chip', s.chips[0] === 'C, G, Am', s.chips[0]);
  const seq = [];
  for (let i = 0; i < 4; i++) { s = await gen(); seq.push(s.drawnKey); }
  check('Generate rotates C \u2192 G \u2192 Am \u2192 C',
    seq.join(' ') === 'major_4-0 minor_5-0 major_0-0 major_4-0', seq.join(' '));
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
  for (let i = 0; i < 4; i++) { s = await gen(); mseq.push(s.drawnSig); }
  check('meters alternate sheet to sheet', mseq.join(' ') === '4/4 3/4 4/4 3/4' || mseq.join(' ') === '3/4 4/4 3/4 4/4', mseq.join(' '));

  // ---- 5. past six keys the subtitle folds ----
  await setKeys(p, ['C', 'G', 'D', 'A', 'E', 'B', 'Am', 'Em']);
  s = await state();
  check('eight keys fold to three +5 in the chip', s.chips[0] === 'C, G, D +5', s.chips[0]);
  check('the panel row folds one rung later, at five', s.cycle === 'C, G, D, A, E +3', s.cycle);

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

  // ---- 7. the open menu follows its anchor through a rebuild ----
  // Ticking a key regenerates, and the regenerate rebuilds the chips. The menu
  // used to hold the button it opened from, which by then was detached, and a
  // detached element measures as a rect of zeros: the second tick parked the
  // menu in the top-left corner of the window.
  await p.click('#sh-sub .pick[data-pick="keys"]');
  await p.waitForTimeout(350);
  const spots = [];
  for (const label of ['F', 'B\u266d', 'E\u266d']) {
    await p.evaluate((l) => {
      const it = [...document.querySelectorAll('#pick-menu .menu-item')]
        .find((e) => e.textContent.replace(/[\u25cf\s]/g, '') === l);
      if (!it) throw new Error('no key ' + l + ' in the open menu');
      it.click();
    }, label);
    await p.waitForTimeout(1400);
    spots.push(await p.evaluate(() => {
      const m = document.getElementById('pick-menu');
      const a = document.querySelector('#sh-sub .pick[data-pick="keys"]');
      if (!m || !a) return 'menu or anchor gone';
      const mr = m.getBoundingClientRect(), ar = a.getBoundingClientRect();
      return Math.abs(mr.x - ar.x) <= 1 && Math.abs(mr.y - (ar.bottom + 6)) <= 1
        ? 'under' : Math.round(mr.x) + ',' + Math.round(mr.y);
    }));
  }
  check('the open menu stays under its anchor across rebuilds',
    spots.every((x) => x === 'under'), spots.join(' | '));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  await p.screenshot({ path: __dirname + '/out/subtitle.png' });   // $PWD-proof: harnesses run from either the repo root or here
  check('no page errors', errs.length === 0, JSON.stringify(errs));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
