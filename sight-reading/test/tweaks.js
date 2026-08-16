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
  // Resolved values, not the raw custom properties: a custom property reads back
  // as its unevaluated calc(), so only the thing it feeds proves it landed.
  const tokens = p => p.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const g = n => cs.getPropertyValue(n).trim();
    const title = getComputedStyle(document.getElementById('sh-title'));
    const secH = document.querySelector('.sec-h');
    const pill = document.querySelector('.presets .pill');
    const cell = document.querySelector('.fig-cell');
    return {
      // raw dials
      typeScale:g('--type-scale'), density:g('--density'), accentH:g('--accent-h'),
      // resolved: each is the thing a dial actually moves
      titlePx: title.fontSize,
      capTrack: secH ? getComputedStyle(secH).letterSpacing : null,
      capWeight: secH ? getComputedStyle(secH).fontWeight : null,
      accent: getComputedStyle(document.body).getPropertyValue('--accent').trim(),
      paper: getComputedStyle(document.body).backgroundColor,
      ink: getComputedStyle(document.body).color,
      pillRadius: pill ? getComputedStyle(pill).borderRadius : null,
      cellRadius: cell ? getComputedStyle(cell).borderRadius : null,
      railW: Math.round(document.querySelector('.rail').getBoundingClientRect().width),
      trough: getComputedStyle(document.querySelector('.rail')).backgroundColor,
      platterR: getComputedStyle(document.querySelector('.band[data-band]')).borderRadius,
      cornerShape: getComputedStyle(document.querySelector('.band[data-band]')).cornerShape,
      gutter: getComputedStyle(document.querySelector('.sheet-area')).paddingLeft,
      metroH: Math.round(document.getElementById('metro-toggle').getBoundingClientRect().height),
      playH: Math.round(document.getElementById('play').getBoundingClientRect().height),
      reduceMotion: document.documentElement.classList.contains('reduce-motion'),
      layout: window.__srLayout ? {...window.__srLayout} : null,
      // Height, not width: fewer bars per line means more systems, and the svg
      // fills the column's width either way.
      staffH: Math.round((document.querySelector('#sheet svg')||{getBoundingClientRect:()=>({height:0})}).getBoundingClientRect().height)
    };
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
  // Open the settings rail first: closed it is display:none at this width, so
  // it would measure 0 in both passes and "rail width" would look dead either
  // way. Open also puts the pills and figure cells on screen for the radii.
  await p.click('#settings-toggle'); await p.waitForTimeout(700);
  const before1x = await tokens(p);
  console.log('?tweaks  : panel=' + (await p.$('#tw') ? 'present' : 'MISSING (bad)') + ' tokens=' + JSON.stringify(before1x));
  const selfBefore = await panelSelf(p);
  console.log('panel@1x : ' + JSON.stringify(selfBefore));
  await p.screenshot({ path: OUT + 'tweaks-default.png' });

  // 3 · drag: type scale up, control size up, density down
  // Open every set first — they render folded-or-remembered, and a control in a
  // closed set has no box to click.
  const openAll = async () => {
    const hs = await p.$$('#tw .tw-h');
    for (const h of hs) {
      const open = await h.evaluate(e => e.parentElement.classList.contains('open'));
      if (!open) { await h.click(); await p.waitForTimeout(60); }
    }
  };
  await openAll();

  // Drive by aria-label so the test names the control, not its index — the
  // whole point of the spec list is that controls move around freely.
  // focus() rather than a click at computed coordinates: with every set open
  // the lower controls sit below the panel's scroll viewport, and raw mouse
  // coordinates then land on whatever happens to be at that point instead.
  const drag = async (label, end) => {
    const s = await p.$(`#tw [aria-label="${label}"]`);
    if (!s) throw new Error('no control named ' + label);
    await s.focus();
    await p.keyboard.press(end);
    await p.waitForTimeout(80);
  };
  const press = async label => {
    const s = await p.$(`#tw [aria-label="${label}"]`);
    if (!s) throw new Error('no control named ' + label);
    await s.evaluate(e => e.click());
    await p.waitForTimeout(80);
  };
  await drag('Type scale', 'End');
  await drag('Control size', 'End');
  await drag('Panel density', 'Home');
  await drag('Caption track', 'End');
  await drag('Label weight', 'End');
  await drag('Accent hue', 'Home');       // 210 -> 0, red
  await drag('Paper warmth', 'End');
  await drag('Pill radius', 'Home');      // round -> 4px
  await drag('Cell radius', 'End');
  await drag('Rail width', 'End');
  await drag('Music margin', 'End');
  await drag('Bars per line', 'Home');    // 6 -> 2
  await drag('Staff size', 'Home');
  await drag('Trough tone', 'End');
  await drag('Platter radius', 'Home');
  await drag('Corner curve', 'End');
  await press('Platter hairline');
  await press('Reduce motion');
  await p.waitForTimeout(600);            // the engraver nudge is debounced
  const after = await tokens(p);
  console.log('dragged  : ' + JSON.stringify(after));
  // Each dial must have moved the thing it drives, not merely its own variable.
  const moved = {
    type:    after.titlePx !== before1x.titlePx,
    track:   after.capTrack !== before1x.capTrack,
    weight:  after.capWeight !== before1x.capWeight,
    accent:  after.accent !== before1x.accent,
    paper:   after.paper !== before1x.paper,
    pill:    after.pillRadius !== before1x.pillRadius,
    cell:    after.cellRadius !== before1x.cellRadius,
    rail:    after.railW !== before1x.railW,
    gutter:  after.gutter !== before1x.gutter,
    control: after.metroH !== before1x.metroH && after.playH === after.metroH + 8,
    music:   after.layout.perLine === 2 && after.layout.zoomCap < 1 && after.staffH !== before1x.staffH,
    motion:  after.reduceMotion === true,
    trough:  after.trough !== before1x.trough,
    platter: after.platterR !== before1x.platterR,
    corner:  after.cornerShape !== before1x.cornerShape
  };
  const dead = Object.keys(moved).filter(k => !moved[k]);
  console.log('each dial bites: ' + (dead.length ? 'NO — dead: ' + dead.join(', ') : 'yes, all ' + Object.keys(moved).length));
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
