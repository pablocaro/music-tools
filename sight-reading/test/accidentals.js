// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);
const { pickDrill, newDrill } = require('./drills.js');

// Parse notes with absolute semitone height + alter + bar index.
const BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function parse(xml) {
  const out = [];
  xml.split(/<measure[ >]/).slice(1).forEach((m, bar) => {
    [...m.matchAll(/<note[\s\S]*?<\/note>/g)].forEach(tag => {
      if (/<rest\s*\/?>/.test(tag)) { out.push({ rest: true, bar }); return; }
      const st = /<step>([A-G])<\/step>/.exec(tag);
      const al = /<alter>(-?\d+)<\/alter>/.exec(tag);
      const oc = /<octave>(\d+)<\/octave>/.exec(tag);
      if (!st || !oc) return;
      const alter = al ? +al[1] : 0;
      out.push({ bar, step: st[1], alter, semi: (+oc[1] + 1) * 12 + BASE[st[1]] + alter });
    });
  });
  return out;
}

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
  await p.waitForTimeout(2200);
  for (let i = 0; i < 5; i++) { if (await p.$('#ob-next')) { await p.click('#ob-next').catch(() => {}); await p.waitForTimeout(200); } }
  await p.click('#settings-toggle'); await p.waitForTimeout(500);

  const setDial = (id, v) => p.evaluate(([i, x]) => {
    const el = document.getElementById(i);
    el.value = x; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change'));
  }, [id, v]);

  // ---- 1. chroma 0, major: no accidentals at all ----
  await setDial('chroma', 0); await p.waitForTimeout(1400);
  let notes = parse(await p.evaluate(() => window.__xml));
  console.log('major, chroma 0 : alters =', notes.filter(n => n.alter).length, '(want 0)');

  // ---- 2. minor + Andalusian (has a V bar): leading tone appears without the dial ----
  // Pinned to A minor: no key signature, so scale tones carry no native alters
  // and the raised 7th is unambiguously G with alter +1. (Flipping mode from C
  // major gives C minor, whose Eb/Ab/Bb all carry alters natively — a first
  // version of this test read those as strays.)
  await p.evaluate(() => {
    const t = document.getElementById('key-tonic');
    t.value = '5-0'; t.dispatchEvent(new Event('change'));
  });
  await p.waitForTimeout(900);
  await p.evaluate(() => document.getElementById('mode-cycle').click());
  await p.waitForTimeout(1200);
  // By id, not by text: "contains V but not VII-i" also described i-iv-V-i
  // the day that progression was added, and the test silently clicked it
  // while still scoring bars against the Andalusian's layout.
  await p.evaluate(() => [...document.querySelectorAll('#progression-pills .opt')]
    .find(x => x.dataset.prog === 'i-VII-VI-V').click());
  await p.waitForTimeout(1400);
  const prog = [0, 6, 5, 4];                       // i-VII-VI-V
  // Accumulated over several exercises, not read off one. A 16-bar line has
  // four V bars and the walk may not put a G in any of them, so a single
  // exercise gave n between 0 and 2 — and at n = 0 "all raised" is true of
  // nothing and the check passed while testing nothing at all.
  let sevenths = 0, raised = 0, strayAlters = 0;
  for (let i = 0; i < 12; i++) {
    if (i) { await p.evaluate(() => document.getElementById('generate').click());
             await p.waitForTimeout(700); }
    notes = parse(await p.evaluate(() => window.__xml));
    const vBars = new Set(); notes.forEach(n => { if (prog[n.bar % 4] === 4) vBars.add(n.bar); });
    // In A minor the 7th degree is G; raised = G#(alter+1)
    const sv = notes.filter(n => !n.rest && n.step === 'G' && vBars.has(n.bar));
    sevenths += sv.length;
    raised   += sv.filter(n => n.alter === 1).length;
    strayAlters += notes.filter(n => n.alter && !(n.step === 'G' && vBars.has(n.bar))).length;
  }
  console.log('minor V bars    : 7th-degree notes', sevenths, 'raised', raised,
    sevenths === 0 ? '(NO SAMPLE — check is vacuous)'
                   : sevenths === raised ? '(all raised)' : '(NOT all raised)');
  console.log('stray alters    :', strayAlters, '(want 0 at chroma 0)');

  // ---- 3. chroma up: figures appear and resolve by semitone ----
  await p.evaluate(() => {
    document.getElementById('mode-cycle').click();               // back to major
    const t = document.getElementById('key-tonic');
    t.value = '0-0'; t.dispatchEvent(new Event('change'));       // back to C
  });
  await p.waitForTimeout(1200);
  // On Chromatic Steps, not on whatever the panel drifted to. A passing tone
  // needs a weak position to live in, so measuring the dial against a line of
  // quarters reports "altered 0" and blames the engine for the rhythm. The
  // note count is the control: it proves there were positions to fill.
  await pickDrill(p, 'Chromatic Steps', 1400);
  await setDial('chroma', 80); await p.waitForTimeout(1500);
  let altered = 0, resolved = 0, sound = 0;
  for (let i = 0; i < 6; i++) {
    if (i) { await p.evaluate(() => document.getElementById('generate').click());
             await p.waitForTimeout(800); }
    const sounding = parse(await p.evaluate(() => window.__xml)).filter(n => !n.rest);
    sound += sounding.length;
    sounding.forEach((n, j) => {
      if (!n.alter) return;
      altered++;
      const next = sounding[j + 1];
      if (next && Math.abs(next.semi - n.semi) === 1) resolved++;
    });
  }
  console.log('major, chroma 80: altered', altered, 'of', sound, 'notes, resolving by semitone', resolved,
    altered > 0 ? Math.round(100 * resolved / altered) + '%' : '(NO SAMPLE — the dial did nothing)');

  // accidental glyphs actually render
  const glyphs = await p.evaluate(() => document.querySelectorAll('#sheet .vf-accidental, #sheet .vf-modifiers path').length);
  console.log('accidental ink  :', glyphs > 0 ? 'present' : 'MISSING');

  // ---- 4. round-trips as preset state ----
  await newDrill(p, 'ChromaTest');
  await setDial('chroma', 0); await p.waitForTimeout(1000);
  await pickDrill(p, 'ChromaTest', 1200);
  console.log('preset round-trip chroma =', await p.evaluate(() => document.getElementById('chroma').value), '(want 80)');
  console.log('errors:', errs);
  await b.close();
})();
