// The Drills band: three rows, the edited state, the park/restore undo, and
// the All drills push.
//
// What this is really guarding is that the band keeps saying where you are.
// Every state below was reachable in the old presets strip too; what was
// missing was any way to see, from the band alone, that you had changed the
// thing you loaded — so the checks that matter here are the "· edited" tag and
// the Restore row, not the geometry.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);
const { pickDrill, newDrill } = require('./drills.js');

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('dialog', (d) => d.dismiss());
  await p.goto('http://localhost:8091/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);
  for (let i = 0; i < 6; i++) { if (await p.$('#ob-next')) { await p.click('#ob-next').catch(() => {}); await p.waitForTimeout(200); } }
  await p.click('#settings-toggle'); await p.waitForTimeout(700);

  const band = () => p.evaluate(() => ({
    title: document.querySelector('[data-band=presets] .band-t').textContent.trim(),
    rows: [...document.querySelectorAll('#presets .drill-row')].map((w) => ({
      name: w.querySelector('.drill-name').textContent.trim(),
      sub: w.querySelector('.drill-sub').textContent.trim(),
      on: w.querySelector('.drill').classList.contains('on'),
      more: !!w.querySelector('.drill-more')
    })),
    acts: [...document.querySelectorAll('#drill-acts .drill-act')].map((a) => a.textContent.trim()),
    h: Math.round(document.querySelector('[data-band=presets]').getBoundingClientRect().height)
  }));
  const lit = (s) => (s.rows.find((r) => r.on) || {}).name || '(none)';
  const show = (tag, s) => {
    console.log(`${tag.padEnd(16)} lit "${lit(s)}"  rows ${s.rows.length}  ${s.h}px`);
    s.rows.forEach((r) => console.log(`    ${r.on ? '*' : ' '} ${r.name.padEnd(24)} ${r.sub}${r.more ? '   ⋯' : ''}`));
    console.log('    actions:', JSON.stringify(s.acts));
  };

  // ---- 1. three rows, each saying what it sets ----
  let s = await band();
  show('opened', s);
  console.log('  title           :', s.title, s.title === 'Drills' ? '' : '(WRONG)');
  console.log('  every row subtitled:', s.rows.every((r) => r.sub.length > 0));
  console.log('  built-ins show ⋯:', s.rows.some((r) => r.more), '(want false — ⋯ is for your own)');

  // ---- 2. picking lights exactly one ----
  await pickDrill(p, 'Wide Leaps', 1200);
  s = await band();
  show('picked Wide', s);
  console.log('  exactly one lit :', s.rows.filter((r) => r.on).length === 1);

  // ---- 3. touch a control: the row stays lit and gains "· edited" ----
  await p.evaluate(() => {
    const el = document.getElementById('chroma');
    el.value = 60; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change'));
  });
  await p.waitForTimeout(1300);
  s = await band();
  show('edited', s);
  const editedRow = s.rows.find((r) => r.on) || {};
  console.log('  says edited     :', /edited/.test(editedRow.name || ''), `("${editedRow.name}")`);
  console.log('  offers a save   :', s.acts.some((a) => /Wide Leaps/.test(a)));

  // ---- 4. leaving an edited setup parks it; Restore is the undo ----
  await pickDrill(p, 'Thirds', 1200);
  s = await band();
  show('left it', s);
  console.log('  offers restore  :', s.acts.some((a) => /↩|Restore|Wide Leaps/.test(a)));
  await p.evaluate(() => {
    const act = [...document.querySelectorAll('#drill-acts .drill-act')]
      .find((a) => a.querySelector('.da-ic').textContent === '↩');
    if (!act) throw new Error('no restore row');
    act.click();
  });
  await p.waitForTimeout(1300);
  s = await band();
  const chroma = await p.evaluate(() => document.getElementById('chroma').value);
  show('restored', s);
  console.log('  chroma back     :', chroma, '(want 60)');

  // ---- 5. saving names it; it lands under Yours with a ⋯ ----
  await newDrill(p, 'DrillTest');
  await p.waitForTimeout(600);
  s = await band();
  show('saved', s);
  const mine = s.rows.find((r) => r.name.startsWith('DrillTest')) || {};
  console.log('  saved is lit    :', !!mine.on, '| has ⋯:', !!mine.more);

  // ---- 5b. the ⋯ menu is outside the row, and rename is a move ----
  // The three destructive-ish actions used to be stacked confirms: dismissing
  // "Update?" immediately offered "Delete?", so one misread tap on the second
  // dialog destroyed a saved drill.
  const menu = await p.evaluate(() => {
    const w = [...document.querySelectorAll('#presets .drill-row')]
      .find((x) => x.querySelector('.drill-name').textContent.startsWith('DrillTest'));
    const more = w.querySelector('.drill-more');
    return {
      moreIsSibling: more.parentNode === w && !w.querySelector('.drill').contains(more),
      nestedButtons: !!w.querySelector('.drill button'),
      hiddenAtRest: w.querySelector('.drill-menu').hidden
    };
  });
  console.log('⋯ menu          :', JSON.stringify(menu), '(sibling, no nested buttons, shut at rest)');
  // Which row is lit before, so "⋯ does not apply the drill" is a comparison
  // and not a reading of a row that was already lit.
  const litBefore = lit(await band());
  const opened = await p.evaluate(() => {
    const w = [...document.querySelectorAll('#presets .drill-row')]
      .find((x) => x.querySelector('.drill-name').textContent.startsWith('DrillTest'));
    w.querySelector('.drill-more').click();
    const m = w.querySelector('.drill-menu');
    return {
      open: !m.hidden,
      items: [...m.querySelectorAll('.menu-item')].map((b) => b.textContent.trim()),
      danger: [...m.querySelectorAll('.menu-item.danger')].map((b) => b.textContent.trim())
    };
  });
  console.log('  opened        :', JSON.stringify(opened));
  console.log('  did not apply :', lit(await band()) === litBefore, `(lit "${litBefore}" throughout)`);
  await p.evaluate(() => document.body.click());
  await p.waitForTimeout(200);
  console.log('  tap outside   :', await p.evaluate(() =>
    [...document.querySelectorAll('.drill-menu')].every((m) => m.hidden)), '(all shut)');

  await p.evaluate(() => {
    window.prompt = () => 'RenamedDrill';
    const w = [...document.querySelectorAll('#presets .drill-row')]
      .find((x) => x.querySelector('.drill-name').textContent.startsWith('DrillTest'));
    w.querySelector('.drill-more').click();
    [...w.querySelectorAll('.menu-item')][0].click();
  });
  await p.waitForTimeout(700);
  s = await band();
  show('renamed', s);
  console.log('  kept its slot :', s.rows.some((r) => r.name.startsWith('RenamedDrill')),
    '| still lit:', lit(s) === 'RenamedDrill');

  // ---- 6. the All drills page: flat sheet, chevrons, add, groups, pick, pop ----
  const pushed = await p.evaluate(() => {
    [...document.querySelectorAll('#drill-acts .drill-act')].find((a) => a.querySelector('.da-n')).click();
    return true;
  });
  await p.waitForTimeout(500);
  const page = await p.evaluate(() => {
    const el = document.getElementById('all-drills');
    const body = document.querySelector('.rail-body');
    const rail = document.querySelector('.rail');
    const r = el.getBoundingClientRect(), rr = rail.getBoundingClientRect();
    return {
      on: rail.classList.contains('pushed'),
      hidden: el.getAttribute('aria-hidden'),
      groups: [...document.querySelectorAll('#all-drills-list .page-group')].map((g) => g.textContent.trim()),
      n: document.querySelectorAll('#all-drills-list .drill').length,
      // A flat sheet the size of the rail: same box, and nothing moving
      // underneath it. The rail used to counter-slide 24% to fake depth.
      sameBox: Math.abs(r.width - rr.width) < 1 && Math.abs(r.height - rr.height) < 1,
      bodyMoved: getComputedStyle(body).transform,
      firstRow: (document.querySelector('#all-drills-list > *') || {}).className
    };
  });
  console.log('pushed          :', JSON.stringify(page));
  console.log('  groups          :', page.groups.join(' / '), '(Yours first)');
  console.log('  flat sheet      : same box as the rail', page.sameBox,
    '| nothing moved under it', page.bodyMoved === 'none' || page.bodyMoved === '');
  console.log('  add row first   :', /page-add/.test(page.firstRow || ''), `("${page.firstRow}")`);

  // Both chevrons draw. #ic-chevron carries no stroke of its own, so a class
  // that sets only a size renders an invisible path — which is what the back
  // control did, at every width, until this checked it.
  const carets = await p.evaluate(() => {
    const one = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      // strokeWidth comes back as "calc(2px)" when it was authored as one, and
      // parseFloat reads that as NaN — which made this check fail on a chevron
      // that draws perfectly well.
      const w = parseFloat(String(cs.strokeWidth).replace(/^calc\(|\)$/g, ''));
      return { stroke: cs.stroke, width: cs.strokeWidth, box: Math.round(r.width),
               inked: cs.stroke !== 'none' && w > 0 && r.width > 0 };
    };
    return { back: one('.page-caret'), act: one('.drill-act .da-caret') };
  });
  console.log('  back chevron    :', JSON.stringify(carets.back));
  console.log('  All drills caret:', JSON.stringify(carets.act));

  // Cancelling the name prompt must not pop the page.
  await p.evaluate(() => {
    window.prompt = () => null;
    document.querySelector('#all-drills-list .page-add').click();
  });
  await p.waitForTimeout(400);
  console.log('  cancel stays    :', await p.evaluate(() =>
    document.querySelector('.rail').classList.contains('pushed')), '(want true)');
  await p.evaluate(() => document.getElementById('drills-back').click());
  await p.waitForTimeout(500);
  console.log('popped          :', await p.evaluate(() => !document.querySelector('.rail').classList.contains('pushed')));

  // A drill picked from the page has to appear in the band, or the band stops
  // saying where you are.
  const where = await pickDrill(p, 'Jig', 1300);
  s = await band();
  show('picked from page', s);
  console.log('  found on        :', where, '| Jig now in the band:', s.rows.some((r) => r.name.startsWith('Jig')));
  console.log('  page popped     :', await p.evaluate(() => !document.querySelector('.rail').classList.contains('pushed')));

  // ---- 7. no reshuffle mid-session ----
  const before = (await band()).rows.map((r) => r.name);
  await pickDrill(p, 'Thirds', 1100);
  await pickDrill(p, 'Jig', 1100);
  const after = (await band()).rows.map((r) => r.name);
  console.log('no reshuffle    :', JSON.stringify(before) === JSON.stringify(after),
    JSON.stringify(before) === JSON.stringify(after) ? '' : `\n  was ${before}\n  now ${after}`);

  // ---- 8. across a reload the band still says where you are ----
  // The panel persists, so the drill it matches has to come back lit and in a
  // slot — a fresh session ranks by use and the drill you left on may not be
  // in the top three on its own.
  await pickDrill(p, 'Long Notes', 1300);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  for (let i = 0; i < 6; i++) { if (await p.$('#ob-next')) { await p.click('#ob-next').catch(() => {}); await p.waitForTimeout(200); } }
  await p.click('#settings-toggle'); await p.waitForTimeout(700);
  s = await band();
  show('after reload', s);
  console.log('  header says     :', await p.evaluate(() => document.getElementById('sh-title').textContent.trim()));
  console.log('  Long Notes lit  :', lit(s) === 'Long Notes');

  // ---- 9. Spanish ----
  await p.evaluate(() => { localStorage.setItem('sr_lang', 'es'); });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  for (let i = 0; i < 6; i++) { if (await p.$('#ob-next')) { await p.click('#ob-next').catch(() => {}); await p.waitForTimeout(200); } }
  await p.click('#settings-toggle'); await p.waitForTimeout(700);
  s = await band();
  show('es', s);
  const untranslated = await p.evaluate(() =>
    [...document.querySelectorAll('#presets .drill-sub, #drill-acts .drill-act')]
      .map((e) => e.textContent.trim()).filter((x) => /\b(steps|bars|and|to|Save|Restore|All drills|New drill)\b/.test(x)));
  console.log('  untranslated    :', JSON.stringify(untranslated), '(want [])');

  // ---- 10. delete refills the slot ----
  // A deleted name is skipped by the renderer, so without refilling, the band
  // came back with two rows and a gap where the third had been.
  // Your own drills keep their name in any language, so this still finds it.
  await pickDrill(p, 'RenamedDrill', 1100);
  await p.evaluate(() => { window.confirm = () => true; });
  const gone = await p.evaluate(() => {
    const w = [...document.querySelectorAll('#presets .drill-row')].find((x) => x.querySelector('.drill-more'));
    if (!w) return null;
    const name = w.querySelector('.drill-name').textContent.trim();
    w.querySelector('.drill-more').click();
    [...w.querySelectorAll('.menu-item.danger')][0].click();
    return name;
  });
  await p.waitForTimeout(700);
  s = await band();
  show('deleted ' + gone, s);
  console.log('  still three   :', s.rows.length === 3, '| gone:', !s.rows.some((r) => r.name === gone));

  console.log('errors:', JSON.stringify(errs));
  await b.close();
})();
