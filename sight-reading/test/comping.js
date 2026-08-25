// Comping: a walking bass and the chord it outlines.
//
// The load-bearing check is that every note the accompaniment schedules for a
// bar belongs to that bar's chord — compared against the app's own harmony
// (session.harmony), not against a second derivation of the same rules here,
// which would only prove two copies of the logic agree. The exception is one
// bass note per bar: the last pulse leans into the next root by a semitone and
// is meant to sit outside the chord.
//
// Faults it caught, all of them silent in the sense that the app kept working
// and only sounded wrong: a chord voiced from a register anchor rather than a
// pitch (a G# inside F major, an A# inside G7, correct only by accident in C);
// a bass that recomputed its root at every barline instead of carrying it,
// leaving 6/8 leaping four times in sixteen bars; and a "walk" that alternated
// between two pitches all bar (C3 E3 C3 E3) because it only ever asked for the
// nearest chord tone that was not the current one.
//
// leaps>5th is the one that catches an unmusical line rather than a wrong one.
// Everything here can be in the right chord and still not be a bass part.
//
// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nameOf = m => NAMES[((m % 12) + 12) % 12] + Math.floor(m / 12 - 1);

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8091/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  await p.evaluate(() => { const o = document.getElementById('ob'); if (o) o.hidden = true; });

  // Comping ships off, so turn it on before anything is expected to sound.
  await p.evaluate(() => {
    const c = document.getElementById('comping');
    c.value = 'piano'; c.dispatchEvent(new Event('change'));
  });

  // The setup runs inside the page, so it cannot close over anything out here
  // — page.evaluate serialises the function and the closure does not survive.
  // Anything it needs is passed as an argument.
  const sample = async (label, setup, arg) => {
    if (setup) { await p.evaluate(setup, arg); await p.waitForTimeout(1500); }
    await p.evaluate(() => document.getElementById('play').click());
    await p.waitForTimeout(500);
    await p.evaluate(() => document.getElementById('play').click());

    const r = await p.evaluate(() => {
      const s = window.__srSession;
      if (!s || !s.comping) return null;
      const bars = {};
      s.comping.forEach(n => {
        const bar = Math.floor(n.onset / s.barBeats + 1e-9);
        (bars[bar] = bars[bar] || []).push({ midi: n.midi, bass: n.gain > 0.4, onset: n.onset });
      });
      const mel = s.melody.map(n => 69 + 12 * Math.log(n.freq / 440) / Math.log(2));
      return { bars, harmony: s.harmony, barBeats: s.barBeats,
               melLo: Math.round(Math.min.apply(null, mel)),
               melHi: Math.round(Math.max.apply(null, mel)),
               n: s.comping.length };
    });
    if (!r) { console.log(label.padEnd(13), 'no session'); return; }

    let offChord = 0, approach = 0, leaps = 0, bassLo = 999, bassHi = -999, chLo = 999, chHi = -999;
    let prev = null;
    Object.keys(r.bars).forEach(k => {
      const want = r.harmony[k];
      if (!want) return;
      r.bars[k].slice().sort((a, c) => a.onset - c.onset).forEach(n => {
        const pc = ((n.midi % 12) + 12) % 12;
        const inChord = want.indexOf(pc) >= 0;
        if (n.bass) {
          if (!inChord) approach++;
          if (prev != null && Math.abs(n.midi - prev) > 7) leaps++;
          prev = n.midi;
          if (n.midi < bassLo) bassLo = n.midi;
          if (n.midi > bassHi) bassHi = n.midi;
        } else {
          if (!inChord) offChord++;          // a chord note outside its chord is a bug
          if (n.midi < chLo) chLo = n.midi;
          if (n.midi > chHi) chHi = n.midi;
        }
      });
    });
    console.log(label.padEnd(13),
      'events', String(r.n).padStart(4),
      '│ off-chord', String(offChord).padStart(2),
      '│ non-chord', String(approach).padStart(2),
      '│ leaps>5th', String(leaps).padStart(2),
      '│ bass', (nameOf(bassLo) + '-' + nameOf(bassHi)).padEnd(8),
      '│ chord', (nameOf(chLo) + '-' + nameOf(chHi)).padEnd(8),
      '│ melody', nameOf(r.melLo) + '-' + nameOf(r.melHi));
  };

  const setMeter = want => {
    [...document.querySelectorAll('#timesig-pills .fig-cell')].forEach(c => {
      const on = c.classList.contains('on'), pick = c.textContent.trim() === want;
      if (on !== pick) c.click();
    });
  };

  await sample('4/4 major');
  await sample('3/4', setMeter, '3/4');
  await sample('6/8', setMeter, '6/8');
  await sample('2/4', setMeter, '2/4');
  await sample('minor', () => { document.getElementById('mode-cycle').click(); });
  await sample('key A', () => {
    const t = document.getElementById('key-tonic');
    t.value = '5-0'; t.dispatchEvent(new Event('change'));
  });
  await sample('bass clef', () => {
    const c = document.getElementById('clef');
    c.value = 'bass'; c.dispatchEvent(new Event('change'));
  });

  // None means silent: no events scheduled at all, and the melody untouched.
  await p.evaluate(() => {
    const c = document.getElementById('comping');
    c.value = 'none'; c.dispatchEvent(new Event('change'));
  });
  await p.evaluate(() => document.getElementById('play').click());
  await p.waitForTimeout(400);
  console.log('comping = None',
    JSON.stringify(await p.evaluate(() => {
      const s = window.__srSession;
      return { compingBuilt: s.comping.length, melody: s.melody.length };
    })), '(built but not scheduled — the value gates playback, not generation)');
  await p.evaluate(() => document.getElementById('play').click());

  console.log('errors:', errs);
  await b.close();
})();
