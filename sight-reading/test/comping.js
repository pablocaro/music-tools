// Comping: one bass note a bar and the chord above it.
//
// The load-bearing check is that every note the accompaniment schedules for a
// bar belongs to that bar's chord — compared against the app's own harmony
// (session.harmony), not against a second derivation of the same rules here,
// which would only prove two copies of the logic agree.
//
// off-chord is correctness. leaps is musicality, and it is the column that
// matters more, because everything here can be in the right chord and still
// not be a bass part: an earlier walking version alternated between two
// pitches all bar (C3 E3 C3 E3) and scored a clean zero on every correctness
// check while sounding like one note per measure. The bass now moves to
// whichever chord tone is nearest the last one, so leaps should be near zero
// and non-chord exactly zero — there are no passing notes left to allow.
//
// Faults these columns caught while the feature was being built: a chord
// voiced from a register anchor rather than a pitch (a G# inside F major, an
// A# inside G7, correct only by accident in C); a bass that recomputed its
// root every barline instead of carrying it, leaving 6/8 leaping four times in
// sixteen bars; and a chord that doubled the bass an octave up, which pushed
// the voicing onto the melody's own floor.
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

  // Every progression must be four bars long, in both modes. roots is one root
  // per BAR, and the engine hardcodes a four-bar phrase (mi % 4), so a
  // progression of any other length drifts against the phrase it is supposed to
  // harmonise: ii-V-I was stored as three bars and only realigned every twelve,
  // landing phrase endings on ii. Checked through the chord symbols on the
  // staff, which is the same harmony the reader sees.
  await p.evaluate(() => document.getElementById('settings-toggle').click());
  await p.waitForTimeout(600);
  for (const mode of ['major', 'minor']) {
    const want = await p.evaluate(m => {
      const cyc = document.getElementById('mode-cycle');
      if (document.getElementById('key-mode').value !== m) cyc.click();
      return document.getElementById('key-mode').value;
    }, mode);
    await p.waitForTimeout(1400);
    const ids = await p.evaluate(() =>
      [...document.querySelectorAll('#progression-pills .opt')].map(o => o.dataset.prog));
    for (const id of ids) {
      await p.evaluate(x => {
        const b = [...document.querySelectorAll('#progression-pills .opt')]
          .find(e => e.dataset.prog === x);
        if (b) b.click();
      }, id);
      await p.waitForTimeout(1300);
      const syms = await p.evaluate(() =>
        [...document.querySelectorAll('#chord-overlay text')].slice(0, 8).map(t => t.textContent));
      const period4 = syms.length >= 8 && [0, 1, 2, 3].every(i => syms[i] === syms[i + 4]);
      console.log('  ' + want.padEnd(6), id.padEnd(12),
        syms.slice(0, 8).join(' ').padEnd(30), period4 ? 'repeats every 4' : 'DOES NOT repeat every 4');
    }
  }

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
