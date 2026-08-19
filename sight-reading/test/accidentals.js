// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);

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
  notes = parse(await p.evaluate(() => window.__xml));
  const prog = [0, 6, 5, 4];                       // i-VII-VI-V
  const vBars = new Set(); notes.forEach(n => { if (prog[n.bar % 4] === 4) vBars.add(n.bar); });
  // In A minor the 7th degree is G; raised = G#(alter+1)
  const sevenths = notes.filter(n => !n.rest && n.step === 'G' && vBars.has(n.bar));
  const raised = sevenths.filter(n => n.alter === 1);
  console.log('minor V bars    : 7th-degree notes', sevenths.length, 'raised', raised.length,
    sevenths.length === raised.length ? '(all raised)' : '(NOT all raised)');
  const strayAlters = notes.filter(n => n.alter && !(n.step === 'G' && vBars.has(n.bar)));
  console.log('stray alters    :', strayAlters.length, '(want 0 at chroma 0)');

  // ---- 3. chroma up: figures appear and resolve by semitone ----
  await p.evaluate(() => {
    document.getElementById('mode-cycle').click();               // back to major
    const t = document.getElementById('key-tonic');
    t.value = '0-0'; t.dispatchEvent(new Event('change'));       // back to C
  });
  await p.waitForTimeout(1200);
  await setDial('chroma', 80); await p.waitForTimeout(1500);
  notes = parse(await p.evaluate(() => window.__xml));
  const sounding = notes.filter(n => !n.rest);
  let altered = 0, resolved = 0;
  sounding.forEach((n, i) => {
    if (!n.alter) return;
    altered++;
    const next = sounding[i + 1];
    if (next && Math.abs(next.semi - n.semi) === 1) resolved++;
  });
  console.log('major, chroma 80: altered', altered, 'resolving by semitone', resolved,
    altered > 0 ? Math.round(100 * resolved / altered) + '%' : '');

  // accidental glyphs actually render
  const glyphs = await p.evaluate(() => document.querySelectorAll('#sheet .vf-accidental, #sheet .vf-modifiers path').length);
  console.log('accidental ink  :', glyphs > 0 ? 'present' : 'MISSING');

  // ---- 4. round-trips as preset state ----
  await p.evaluate(() => { window.prompt = () => 'ChromaTest';
    [...document.querySelectorAll('.presets .pill')].find(e => e.textContent.trim().startsWith('+')).click(); });
  await p.waitForTimeout(500);
  await setDial('chroma', 0); await p.waitForTimeout(1000);
  await p.evaluate(() => [...document.querySelectorAll('.presets .pill')].find(e => e.textContent.trim().startsWith('ChromaTest')).click());
  await p.waitForTimeout(1200);
  console.log('preset round-trip chroma =', await p.evaluate(() => document.getElementById('chroma').value), '(want 80)');
  console.log('errors:', errs);
  await b.close();
})();
