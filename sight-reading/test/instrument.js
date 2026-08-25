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
  await p.evaluate(() => localStorage.clear());   // fresh visitor
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);

  const state = () => p.evaluate(() => ({
    obUp: !document.getElementById('ob').hidden,
    title: (document.getElementById('ob-title') || {}).textContent,
    clef: document.getElementById('clef').value,
    // The point of this line is that picking an instrument moves the range as
    // well as the clef. It used to read the old per-octave checkbox grid and
    // had been left as a stub that iterated nothing and returned null, so the
    // half of the behaviour it existed to check was going unmeasured. The
    // range is two readouts now.
    range: (document.getElementById('low-val') || {}).textContent + '-' +
           (document.getElementById('high-val') || {}).textContent
  }));

  console.log('fresh load        :', JSON.stringify(await state()));
  await p.click('#ob-next'); await p.waitForTimeout(400);          // intro -> instrument
  console.log('page 2            :', JSON.stringify(await state()));
  console.log('pills             :', await p.evaluate(() => [...document.querySelectorAll('.ob-instr')].map(x => x.textContent + (x.classList.contains('on') ? '*' : ''))));

  await p.evaluate(() => [...document.querySelectorAll('.ob-instr')].find(x => x.textContent === 'Cello').click());
  await p.waitForTimeout(1200);
  console.log('picked Cello      :', JSON.stringify(await state()));

  await p.click('#ob-next'); await p.waitForTimeout(600);          // -> vocab (applies steps only)
  console.log('vocab page        :', JSON.stringify(await state()), '(clef must still be bass)');
  await p.click('#ob-next'); await p.waitForTimeout(1500);         // finish
  console.log('finished          :', JSON.stringify(await state()));

  // the stomping fix: a built-in preset keeps the reader's clef
  await p.click('#settings-toggle'); await p.waitForTimeout(500);
  await p.evaluate(() => [...document.querySelectorAll('.presets .pill')].find(x => x.textContent.trim().startsWith('Thirds')).click());
  await p.waitForTimeout(1200);
  console.log('after Thirds Drill:', await p.evaluate(() => document.getElementById('clef').value), '(want bass)');

  // panel pills reflect and change the pref
  console.log('panel pills       :', await p.evaluate(() => [...document.querySelectorAll('#instrument-pills .opt')].filter(x => x.classList.contains('on')).map(x => x.textContent)));
  await p.evaluate(() => [...document.querySelectorAll('#instrument-pills .opt')].find(x => x.textContent === 'Viola').click());
  await p.waitForTimeout(1200);
  console.log('picked Viola      :', await p.evaluate(() => document.getElementById('clef').value), '(want alto)');

  // survives reload; onboarding does NOT reappear
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
  console.log('after reload      :', JSON.stringify(await p.evaluate(() => ({
    obUp: !document.getElementById('ob').hidden,
    lit: [...document.querySelectorAll('#instrument-pills .opt')].filter(x => x.classList.contains('on')).map(x => x.textContent)
  }))));
  console.log('errors:', errs);
  await b.close();
})();
