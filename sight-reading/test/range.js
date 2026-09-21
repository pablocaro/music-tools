// Intervals the range cannot hold.
//
// The visible half is the muted cell; the half that matters is the alphabet.
// An interval wider than the range used to be drawn anyway, go out of bounds,
// reflect, go out of bounds again and clamp — so it did not fail quietly, it
// pinned the line to the top or bottom of the range and held it there. Running
// this with the filter in readAlphabet() removed measures 12/12 exercises
// pinned, 49% repeated notes, 0% steps.
//
// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);

const STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

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
  await p.evaluate(() => {
    const ob = document.getElementById('ob'); if (ob) ob.hidden = true;
    document.getElementById('settings-toggle').click();
  });
  await p.waitForTimeout(900);

  // * = on, ~ = muted. A cell can be both: the setting survives a range that
  // cannot currently honour it.
  const cells = () => p.evaluate(() => [...document.querySelectorAll('#matrix .fig-cell')]
    .map(c => c.querySelector('.fig-txt').textContent +
              (c.classList.contains('on') ? '*' : '') +
              (c.classList.contains('muted') ? '~' : '')).join(' '));
  const range = () => p.evaluate(() => document.getElementById('low-val').textContent +
                                       '-' + document.getElementById('high-val').textContent);
  // Turning a cell off can take two clicks, not one: the cycle is
  // off -> on -> x2 -> off, so a lit cell may still be lit after one tap.
  const setCells = on => p.evaluate(want => {
    const cs = [...document.querySelectorAll('#matrix .fig-cell')];
    cs.forEach((c, i) => {
      const should = want.indexOf(i) >= 0;
      for (let k = 0; k < 3 && c.classList.contains('on') !== should; k++) c.click();
    });
  }, on);
  // Walk a stepper to its stop rather than a fixed count — it disables at the
  // floor, and clicking a disabled button just hangs.
  const squeeze = async () => {
    for (let i = 0; i < 40; i++) {
      if (await p.evaluate(() => document.getElementById('low-up').disabled)) return;
      await p.click('#low-up'); await p.waitForTimeout(60);
    }
  };
  const spanOf = () => p.evaluate(S => {
    const g = id => { const t = document.getElementById(id).textContent;
                      return +t.slice(-1) * 7 + S[t[0]]; };
    return g('high-val') - g('low-val');
  }, STEP);
  const pitches = () => p.evaluate(S => {
    const out = [], re = /<step>([A-G])<\/step>\s*(?:<alter>-?\d+<\/alter>\s*)?<octave>(\d)<\/octave>/g;
    let m; while ((m = re.exec(window.__xml))) out.push(+m[2] * 7 + S[m[1]]);
    return out;
  }, STEP);

  // Arm the three widest intervals while there is room for them, then take the
  // room away.
  await setCells([1, 5, 6, 7]);
  await p.waitForTimeout(700);
  console.log('wide          ', await range(), '|', await cells());

  await squeeze();
  await p.waitForTimeout(700);
  const span = await spanOf();
  console.log('narrowed      ', await range(), '|', await cells());

  // A lit cell the range cannot honour has to LOOK different from a lit cell it
  // can, and the selected state is a stroke over a wash now — so the muted one
  // inverts, keeping a fill and dropping its edge. Nothing about that survives
  // a class-name check: the two differ only in what they paint.
  const look = await p.evaluate(() => {
    const grab = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, edge: s.borderTopColor, ink: s.color,
               op: s.opacity, w: s.borderTopWidth };
    };
    return {
      litOk:    grab(document.querySelector('#matrix .fig-cell.on:not(.muted)')),
      litMuted: grab(document.querySelector('#matrix .fig-cell.muted.on')),
      off:      grab(document.querySelector('#matrix .fig-cell:not(.on):not(.muted)'))
    };
  });
  console.log('lit, honoured :', JSON.stringify(look.litOk));
  console.log('lit, muted    :', JSON.stringify(look.litMuted));
  if (!look.litOk || !look.litMuted) {
    console.log('  distinct    : NO SAMPLE — need one lit cell of each kind, had',
      (look.litOk ? 'honoured' : '') + (look.litMuted ? ' muted' : '') || 'neither');
  } else {
    console.log('  distinct    :',
      look.litOk.bg !== look.litMuted.bg || look.litOk.edge !== look.litMuted.edge);
  }
  console.log('  same box    :', look.litOk && look.off && look.litOk.w === look.off.w,
    '(the stroke colours a reserved border — selecting must not reflow)');
  console.log('span          ', span, '(the floor is a third: 2)');

  // A muted cell does not cycle. It explains itself instead.
  const before = await cells();
  await p.evaluate(() => document.querySelectorAll('#matrix .fig-cell')[7].click());
  await p.waitForTimeout(400);
  console.log('tap muted     ', 'state changed:', before !== (await cells()),
    '| dialog:', await p.evaluate(() => !document.getElementById('note-sheet').hidden));
  console.log('  says        ', await p.evaluate(() =>
    document.getElementById('note-title').textContent + ' — ' +
    document.getElementById('note-body').textContent));
  await p.click('#note-ok'); await p.waitForTimeout(300);

  // The measurement: with only unreachable intervals left on, the line must
  // walk in steps inside the range, not sit on a boundary.
  await p.evaluate(() => {
    const cs = [...document.querySelectorAll('#matrix .fig-cell')];
    cs.forEach((c, i) => {
      for (let k = 0; k < 3 && i <= 2 && c.classList.contains('on'); k++) c.click();
    });
  });
  await p.waitForTimeout(700);
  console.log('only wide on  ', await cells(), '(nothing reachable is lit)');

  let over = 0, pinned = 0, moves = 0, steps = 0, repeats = 0;
  for (let i = 0; i < 12; i++) {
    await p.evaluate(() => document.getElementById('generate').click());
    await p.waitForTimeout(400);
    const n = await pitches();
    if (Math.max(...n) - Math.min(...n) > span) over++;
    let run = 1, worst = 1;
    for (let k = 1; k < n.length; k++) {
      const d = Math.abs(n[k] - n[k - 1]); moves++;
      if (d === 1) steps++;
      if (d === 0) { repeats++; run++; worst = Math.max(worst, run); } else run = 1;
    }
    if (worst >= 4) pinned++;
  }
  console.log('12 exercises  ', 'out of range:', over, '| pinned:', pinned,
    '| steps:', Math.round(100 * steps / moves) + '%',
    '| repeats:', Math.round(100 * repeats / moves) + '%');

  // Widening gives every setting back untouched.
  for (let i = 0; i < 40; i++) {
    if (await p.evaluate(() => document.getElementById('low-down').disabled)) break;
    await p.click('#low-down'); await p.waitForTimeout(60);
  }
  await p.waitForTimeout(700);
  console.log('widened       ', await range(), '|', await cells());

  console.log('errors:', errs);
  await b.close();
})();
