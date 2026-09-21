// Ties across barlines. Four things have to hold at once, and only the first
// is visible in the rendered page:
//   - the two halves are the same pitch (a tie between two pitches is not one)
//   - every bar still holds exactly its meter, after the carry ate the front
//   - the curve is drawn — twice when the tie straddles a staff-line break,
//     which is the engraving convention, not a bug
//   - a tied pair is ONE attack, so the reader hears what the notation says
//
// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8091/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    const P = window.osme.OpenSheetMusicDisplay.prototype, o = P.load;
    P.load = function (x) { window.__xml = x; return o.apply(this, arguments); };
  });
  await p.waitForTimeout(2400);
  for (let i = 0; i < 6; i++) { if (await p.$('#ob-next')) { await p.click('#ob-next').catch(() => {}); await p.waitForTimeout(250); } }
  await p.click('#settings-toggle'); await p.waitForTimeout(600);

  let bad = 0;

  const check = async (label) => {
    const r = await p.evaluate(() => {
      const xml = window.__xml;
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const measures = [...doc.querySelectorAll('measure')];
      const starts = (xml.match(/<tie type="start"/g) || []).length;
      const stops = (xml.match(/<tie type="stop"/g) || []).length;

      const key = n => {
        const s = n.querySelector('step'), o = n.querySelector('octave'), a = n.querySelector('alter');
        return s ? `${s.textContent}${o ? o.textContent : ''}${a ? a.textContent : '0'}` : 'rest';
      };
      // .staffline identity, not a y coordinate: a notehead's height is its
      // pitch, not the line it sits on
      const lines = [...document.querySelectorAll('#sheet .staffline')];
      const gm = [...document.querySelectorAll('#sheet g.vf-measure')];
      const rowOf = i => lines.findIndex(l => gm[i] && l.contains(gm[i]));

      let mismatched = 0, same = 0, cross = 0;
      measures.forEach((m, i) => {
        const notes = [...m.querySelectorAll('note')];
        const last = notes[notes.length - 1];
        if (!last || !last.querySelector('tie[type=start]')) return;
        const next = measures[i + 1] ? [...measures[i + 1].querySelectorAll('note')][0] : null;
        if (!next || !next.querySelector('tie[type=stop]') || key(next) !== key(last)) mismatched++;
        (rowOf(i) === rowOf(i + 1) ? same++ : cross++);
      });

      const div = +(/<divisions>(\d+)<\/divisions>/.exec(xml) || [0, 1])[1];
      const bt = /<beats>(\d+)<\/beats>/.exec(xml), bd = /<beat-type>(\d+)<\/beat-type>/.exec(xml);
      const barBeats = bt && bd ? (+bt[1]) * 4 / (+bd[1]) : 4;
      let badBars = 0;
      measures.forEach(m => {
        let t = 0;
        m.querySelectorAll('note').forEach(n => {
          if (n.querySelector('chord')) return;
          t += +(n.querySelector('duration') || { textContent: 0 }).textContent;
        });
        if (Math.abs(t / div - barBeats) > 0.01) badBars++;
      });

      let pitched = 0;
      doc.querySelectorAll('note').forEach(n => { if (!n.querySelector('rest')) pitched++; });

      return { starts, stops, mismatched, badBars, bars: measures.length,
               curves: document.querySelectorAll('#sheet g.vf-stavetie').length,
               wantCurves: same + cross * 2, cross, pitched };
    });

    // playback lives in a session, which only exists once play has been pressed
    await p.click('#play').catch(() => {});
    await p.waitForTimeout(700);
    const play = await p.evaluate(() => {
      const s = window.__srSession;
      return (s && s.melody) ? { events: s.melody.length,
        longest: +Math.max(...s.melody.map(m => m.dur)).toFixed(2) } : null;
    });
    await p.click('#play').catch(() => {});
    await p.waitForTimeout(300);

    const okPitch = r.mismatched === 0, okBars = r.badBars === 0;
    const okCurves = r.curves === r.wantCurves;
    const okPlay = play && play.events === r.pitched - r.starts;
    if (!(okPitch && okBars && okCurves && okPlay)) bad++;
    console.log(
      `${label.padEnd(11)} ties ${String(r.starts).padStart(2)}` +
      ` (${r.cross} across a line break)` +
      ` | same pitch ${okPitch ? '✓' : '✗ ' + r.mismatched} ` +
      ` | bars exact ${okBars ? '✓' : '✗ ' + r.badBars + '/' + r.bars}` +
      ` | curves ${r.curves}/${r.wantCurves} ${okCurves ? '✓' : '✗'}` +
      ` | attacks ${play ? play.events : '?'}/${r.pitched - r.starts} ${okPlay ? '✓' : '✗'}` +
      ` | longest ${play ? play.longest : '?'}`);
  };

  await check('off');
  for (const rate of ['some', 'lots']) {
    await p.evaluate(x => [...document.querySelectorAll('#ties-pills .opt')]
      .find(b => b.dataset.ties === x).click(), rate);
    await p.waitForTimeout(1800);
    await check(rate);
  }
  // Meter is a set of fig-cells now, not a row of pills, so picking one means
  // lighting it and clearing the rest — and in that order, since the control
  // clamps at one and refuses to empty itself. The old selector found nothing
  // and this loop died on .find(...).click() rather than running.
  for (const ts of ['3/4', '6/8']) {
    await p.evaluate(x => {
      const cells = [...document.querySelectorAll('#timesig-pills .fig-cell')];
      const want = cells.find(c => c.textContent.trim() === x);
      if (want && !want.classList.contains('on')) want.click();
      cells.forEach(c => { if (c !== want && c.classList.contains('on')) c.click(); });
    }, ts);
    await p.waitForTimeout(1800);
    await check(ts + ' lots');
  }

  console.log(bad === 0 ? '\nall clean' : `\n${bad} configuration(s) with a defect`);
  console.log('errors:', errs);
  await b.close();
})();
