// Rail layout: the settings panel as a right-hand rail, the transport as a
// floating pill. Checks the three states the redesign promises at each width:
//   desktop (>=1100px)  rail pushes the music, which re-engraves narrower;
//                       the transport pill re-centres on the shrunk column;
//                       a header popover can be open beside the open rail
//   iPad / narrow       rail overlays from the right; the music's width (and
//                       engraving) is untouched; the scrim keeps a tappable
//                       sliver; Escape closes it even where it covers its ⚙
// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const errs = [];
  const page = async (w, h) => {
    const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
    p.on('pageerror', e => errs.push(e.message));
    // Headless chromium here has no mp3 codec, so priming audio (any click does)
    // floods sample-decode errors; the favicon 404 is the bare test server.
    // Neither is the app's fault, and both would drown a real error.
    const NOISE = /sample .* EncodingError|Failed to load resource/;
    p.on('console', m => { if (m.type() === 'error' && !NOISE.test(m.text())) errs.push('console: ' + m.text()); });
    await p.goto('http://localhost:8091/', { waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);
    for (let i = 0; i < 4; i++) { if (await p.$('#ob-next')) { await p.click('#ob-next').catch(()=>{}); await p.waitForTimeout(200); } }
    return p;
  };
  const state = p => p.evaluate(() => {
    const r = document.querySelector('.rail').getBoundingClientRect();
    const cb = document.querySelector('.controlbar').getBoundingClientRect();
    const co = document.querySelector('.content').getBoundingClientRect();
    const svg = document.querySelector('#sheet svg');
    const scrim = getComputedStyle(document.getElementById('scrim'));
    return {
      open: document.querySelector('.layout').classList.contains('panel-open'),
      railVisible: r.width > 0 && r.left < innerWidth,
      railLeft: Math.round(r.left), railW: Math.round(r.width),
      contentW: Math.round(co.width),
      pillCenter: Math.round(cb.left + cb.width / 2),
      contentCenter: Math.round(co.left + co.width / 2),
      sheetW: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
      scrimTappable: scrim.pointerEvents !== 'none',
      expanded: document.getElementById('settings-toggle').getAttribute('aria-expanded')
    };
  });

  // --- desktop: push -------------------------------------------------------
  let p = await page(1280, 900);
  const dc = await state(p);                       // closed
  await p.click('#settings-toggle'); await p.waitForTimeout(600);
  const dOpen = await state(p);                    // open
  const pushed = dOpen.contentW < dc.contentW && dOpen.railVisible && !dc.railVisible;
  const reflow = dOpen.sheetW < dc.sheetW;         // narrower region -> re-engraved narrower
  const recentred = Math.abs(dOpen.pillCenter - dOpen.contentCenter) <= 2 && dOpen.pillCenter < dc.pillCenter;
  console.log('desktop closed->open :', JSON.stringify({ pushed, reflow, recentred, scrim: dOpen.scrimTappable, aria: dc.expanded + '->' + dOpen.expanded }),
    '(want pushed, reflowed, pill centred on shrunk column, scrim inert, aria false->true)');

  // popover beside the open rail: opening pace must not slam the rail shut
  await p.click('#metro-toggle'); await p.waitForTimeout(300);
  const both = await p.evaluate(() => ({
    railOpen: document.querySelector('.layout').classList.contains('panel-open'),
    popOpen: !document.getElementById('pace-pop').hidden,
    popClear: document.getElementById('pace-pop').getBoundingClientRect().right
              <= document.querySelector('.rail').getBoundingClientRect().left + 1
  }));
  console.log('pushed rail + popover :', JSON.stringify(both), '(want all true — coexist, no overlap)');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);   // closes pop first…
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);   // …then rail
  const dEsc = await state(p);
  console.log('desktop 2x Escape     :', JSON.stringify({ open: dEsc.open, sheetBack: dEsc.sheetW === dc.sheetW }), '(want closed, engraving restored)');

  // --- iPad landscape: overlay --------------------------------------------
  p = await page(1024, 768);
  const ic = await state(p);
  await p.click('#settings-toggle'); await p.waitForTimeout(600);
  const io = await state(p);
  console.log('ipad closed->open     :', JSON.stringify({
    overlaid: io.railVisible && io.contentW === ic.contentW,
    noReflow: io.sheetW === ic.sheetW,
    sliver: io.railLeft > 0,
    scrim: io.scrimTappable
  }), '(want overlay: same content width, same engraving, tappable sliver + scrim)');
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  console.log('ipad Escape           :', JSON.stringify({ open: (await state(p)).open }), '(want closed — rail covers its own ⚙ there)');

  // scrim click closes too
  await p.click('#settings-toggle'); await p.waitForTimeout(600);
  await p.mouse.click(20, 400); await p.waitForTimeout(600);
  console.log('ipad scrim tap        :', JSON.stringify({ open: (await state(p)).open }), '(want closed)');

  // --- phone: same overlay, near-full width -------------------------------
  p = await page(390, 844);
  await p.click('#settings-toggle'); await p.waitForTimeout(600);
  const po = await state(p);
  console.log('phone open            :', JSON.stringify({ railW: po.railW, sliver: po.railLeft > 0, cap: po.railW <= Math.round(390 * 0.88) + 1 }),
    '(want rail capped at 88vw with a sliver left)');

  // --- platters ------------------------------------------------------------
  // The rail is a trough of white cards. Three things can quietly break: the
  // stack stops reading (a control the same tone as the trough looks like a
  // hole in the card), folding stops persisting, or a platter loses its title.
  p = await page(1500, 1000);
  await p.click('#settings-toggle'); await p.waitForTimeout(700);
  const lum = s => p.evaluate(sel => {
    const e = document.querySelector(sel); if (!e) return null;
    const [r, g, b] = getComputedStyle(e).backgroundColor.match(/[\d.]+/g).map(Number);
    return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }, s);
  const trough = await lum('.rail'), platter = await lum('.band[data-band]'), fill = await lum('.cycle');
  console.log('platter stack         : ' + JSON.stringify({ trough, fill, platter }) +
    ' (want trough < control fill < platter — a control must never match the trough)');

  const bands = await p.evaluate(() => ({
    count: document.querySelectorAll('.band[data-band]').length,
    titled: [...document.querySelectorAll('.band[data-band]')].every(b => b.querySelector('.band-t').textContent.trim()),
    allOpen: [...document.querySelectorAll('.band[data-band]')].every(b => !b.classList.contains('folded')),
    intro: !!document.querySelector('.band-intro .intro-more')
  }));
  console.log('platters on first load: ' + JSON.stringify(bands) + ' (want 6, all titled, all open, intro present)');

  // fold two, reload, they must still be folded
  await p.evaluate(() => {
    document.querySelector('[data-band="pitch"] .band-h').click();
    document.querySelector('[data-band="aids"] .band-h').click();
  });
  await p.waitForTimeout(200);
  const folded = await p.evaluate(() => ({
    pitch: document.querySelector('[data-band="pitch"]').classList.contains('folded'),
    aria: document.querySelector('[data-band="pitch"] .band-h').getAttribute('aria-expanded'),
    bodyHidden: getComputedStyle(document.querySelector('#bb-pitch')).display
  }));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#sheet svg', { timeout: 20000 }); await p.waitForTimeout(500);
  await p.click('#settings-toggle'); await p.waitForTimeout(600);
  const after = await p.evaluate(() => ({
    pitch: document.querySelector('[data-band="pitch"]').classList.contains('folded'),
    aids: document.querySelector('[data-band="aids"]').classList.contains('folded'),
    presets: document.querySelector('[data-band="presets"]').classList.contains('folded')
  }));
  console.log('fold + persist        : ' + JSON.stringify({ ...folded, afterReload: after }) +
    ' (want folded/false/none, and only those two still folded after a reload)');

  console.log('errors:', JSON.stringify(errs));
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
