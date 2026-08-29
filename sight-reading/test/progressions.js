// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);
const { pickDrill, newDrill } = require('./drills.js');
const LET = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

// Chord-tone rate of the score against an arbitrary progression, in C major.
function adherence(xml, roots) {
  let on = 0, total = 0;
  xml.split(/<measure[ >]/).slice(1).forEach((m, i) => {
    const r = roots[i % roots.length];
    const tones = [r % 7, (r + 2) % 7, (r + 4) % 7];
    [...m.matchAll(/<step>([A-G])<\/step>/g)].forEach(x => {
      total++;
      if (tones.indexOf(LET[x[1]]) >= 0) on++;
    });
  });
  return Math.round(100 * on / total);
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

  // arpeggio alphabet + full dial, so the harmony actually pulls
  await pickDrill(p, 'Arpeggios', 1300);

  console.log('major pills :', await p.evaluate(() => [...document.querySelectorAll('#progression-pills .opt')].map(x => x.textContent + (x.classList.contains('on') ? '*' : ''))));

  // pick I-V-vi-IV and confirm the *notes* follow it (not the old I-IV-V-I)
  const PROGS = { 'I–V–vi–IV': [0, 4, 5, 3], 'ii–V–I': [1, 4, 0, 0] };
  for (const [label, roots] of Object.entries(PROGS)) {
    await p.evaluate(l => [...document.querySelectorAll('#progression-pills .opt')].find(x => x.textContent === l).click(), label);
    await p.waitForTimeout(1400);
    const xml = await p.evaluate(() => window.__xml);
    console.log(label.padEnd(11), 'adherence to itself:', adherence(xml, roots) + '%',
      '  to I-IV-V-I:', adherence(xml, [0, 3, 4, 0]) + '%');
  }

  // chord names: on by default, correct spelling, and ii-V-I fills four bars
  const names = await p.evaluate(() => [...document.querySelectorAll('#chord-overlay text')].map(t => t.textContent));
  console.log('chord names :', names.slice(0, 6), '(want Dm G7 C C Dm G7…)');

  // toggle off removes them
  await p.evaluate(() => document.getElementById('chords-toggle').click());
  await p.waitForTimeout(300);
  console.log('after toggle:', await p.evaluate(() => !!document.getElementById('chord-overlay')), '(want false)');
  await p.evaluate(() => document.getElementById('chords-toggle').click());

  // mode flip: minor list appears, invalid id remaps
  await p.evaluate(() => document.getElementById('mode-cycle').click());
  await p.waitForTimeout(1400);
  console.log('minor pills :', await p.evaluate(() => [...document.querySelectorAll('#progression-pills .opt')].map(x => x.textContent + (x.classList.contains('on') ? '*' : ''))));
  console.log('stored id   :', await p.evaluate(() => document.getElementById('progression').value));

  // dial at zero hides the names (relevance gate)
  await p.evaluate(() => {
    const M = document.getElementById('musicality');
    M.value = 0; M.dispatchEvent(new Event('input')); M.dispatchEvent(new Event('change'));
  });
  await p.waitForTimeout(1400);
  console.log('dial 0 names:', await p.evaluate(() => !!document.getElementById('chord-overlay')), '(want false)');
  console.log('errors:', errs);
  await b.close();
})();
