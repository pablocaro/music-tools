// Tweaks panel: the ?tweaks design-token sliders for spacing and type.
// The four things that could quietly break:
//   inert     no ?tweaks -> no panel, and tokens identical to the flagged page,
//             so the panel cannot change the design merely by existing
//   drives    a slider moves its token AND the thing the token feeds
//             (--ctl-h -> button height, --type-scale -> rendered title px),
//             including --ctl-h-lg, which is derived and must follow at +8
//   immune    the panel reads none of the tokens it drives — measured, because
//             the app's global `button` rule caught it once already
//   round-trip persists across a reload, Reset restores every control, and the
//             pasted block names the tokens that moved
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);
const OUT = process.env.OUT || '/tmp/';
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const errs = [];
  const open = async (url, w=1280, h=900) => {
    const p = await (await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:2 })).newPage();
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type()==='error' && !/EncodingError|Failed to load resource/.test(m.text())) errs.push('c:'+m.text()); });
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#sheet svg', { timeout: 20000 });
    await p.waitForTimeout(600);
    for (let i=0;i<4;i++){ if (await p.$('#ob-next')) { await p.click('#ob-next').catch(()=>{}); await p.waitForTimeout(200);} }
    return p;
  };
  const tokens = p => p.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const g = n => cs.getPropertyValue(n).trim();
    return { typeScale:g('--type-scale'), fs4:g('--fs-4'), fs2:g('--fs-2'), density:g('--density'),
             ctlH:g('--ctl-h'), ctlLg:g('--ctl-h-lg'), tbGap:g('--tb-gap'),
             titlePx: getComputedStyle(document.getElementById('sh-title')).fontSize,
             metroH: Math.round(document.getElementById('metro-toggle').getBoundingClientRect().height),
             playH: Math.round(document.getElementById('play').getBoundingClientRect().height) };
  });
  // The panel must not read the tokens it drives, or the slider deforms under
  // the cursor. Measured, not eyeballed.
  const panelSelf = p => p.evaluate(() => {
    const c = document.getElementById('tw-copy');
    if (!c) return null;
    const cs = getComputedStyle(c), lab = document.querySelector('#tw .tw-l span');
    return { copyFont: cs.fontSize, copyH: Math.round(c.getBoundingClientRect().height),
             labelFont: getComputedStyle(lab).fontSize,
             panelW: Math.round(document.getElementById('tw').getBoundingClientRect().width) };
  });

  // 1 · no flag -> nothing at all
  let p = await open('http://localhost:8091/');
  console.log('no flag  : panel=' + (await p.$('#tw') ? 'PRESENT (bad)' : 'absent') + ' tokens=' + JSON.stringify(await tokens(p)));
  await p.context().close();

  // 2 · with flag -> panel, defaults identical to the un-flagged page
  p = await open('http://localhost:8091/?tweaks');
  console.log('?tweaks  : panel=' + (await p.$('#tw') ? 'present' : 'MISSING (bad)') + ' tokens=' + JSON.stringify(await tokens(p)));
  const selfBefore = await panelSelf(p);
  console.log('panel@1x : ' + JSON.stringify(selfBefore));
  await p.screenshot({ path: OUT + 'tweaks-default.png' });

  // 3 · drag: type scale up, control size up, density down
  // Click the track to focus, then End/Home — real input events on the real
  // control, and unlike an edge click it can't land a pixel outside.
  const drag = async (i, end) => {
    const s = (await p.$$('#tw input[type=range]'))[i];
    const bb = await s.boundingBox();
    await p.mouse.click(bb.x + bb.width/2, bb.y + bb.height/2);
    await p.keyboard.press(end);
    await p.waitForTimeout(120);
  };
  await drag(0, 'End');    // type scale -> max
  await drag(3, 'End');    // control size -> max
  await drag(2, 'Home');   // density -> min
  const after = await tokens(p);
  console.log('dragged  : ' + JSON.stringify(after));
  const selfAfter = await panelSelf(p);
  const immune = JSON.stringify(selfBefore) === JSON.stringify(selfAfter);
  console.log('panel@max: ' + JSON.stringify(selfAfter) + '  immune=' + (immune ? 'yes' : 'NO (bad)'));
  await p.screenshot({ path: OUT + 'tweaks-dragged.png' });

  // 4 · the prompt block
  await p.click('#settings-toggle'); await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + 'tweaks-rail.png' });
  const block = await p.evaluate(() => {
    // read the serialiser's output without needing clipboard permissions
    const btn = document.getElementById('tw-copy');
    let captured = null;
    const real = navigator.clipboard && navigator.clipboard.writeText;
    if (real) navigator.clipboard.writeText = t => { captured = t; return Promise.resolve(); };
    btn.click();
    return new Promise(r => setTimeout(() => r(captured), 100));
  });
  console.log('--- copy as prompt ---\n' + block + '\n----------------------');

  // 5 · persistence + reset
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#tw', { timeout: 10000 }); await p.waitForTimeout(400);
  console.log('reloaded : ' + JSON.stringify(await tokens(p)));
  await p.click('#tw-reset'); await p.waitForTimeout(200);
  console.log('reset    : ' + JSON.stringify(await tokens(p)));

  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
