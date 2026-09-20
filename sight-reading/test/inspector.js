// The tweaks inspector: right-click anything in ?tweaks and get only the dials
// that shape it. It had no harness at all, which is how it went unnoticed that
// a chevron offers size and weight but nothing for its colour.
//
// Read the inspector through .tw-empty, never by counting rows or matching
// text. The empty state and each dial's note shared the class .tw-n until this
// test needed to tell them apart, and "is it empty" answered yes for a full
// panel — a false negative that reads exactly like a broken feature.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);

let fails = 0;
const check = (label, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (got != null ? '  ' + got : ''));
  if (!ok) fails++;
};

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8091/?tweaks', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  for (let i = 0; i < 4; i++) {
    if (await p.$('#ob-next')) { await p.click('#ob-next').catch(() => {}); await p.waitForTimeout(200); }
  }
  await p.waitForTimeout(700);
  await p.evaluate(() => { if (!document.querySelector('.layout.panel-open')) document.getElementById('settings-toggle').click(); });
  await p.waitForTimeout(700);

  // A real contextmenu event, not click({button:'right'}) — the panel floats
  // over the page, so actionability times out on anything underneath it.
  const inspect = async (sel) => {
    const r = await p.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return { err: 'no element ' + s };
      const box0 = document.getElementById('tw-insp');
      if (box0) box0.remove();
      const rect = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true,
        clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }));
      const box = document.getElementById('tw-insp');
      if (!box) return { err: 'inspector did not open' };
      return {
        head: box.querySelector('.tw-insp-h b').textContent,
        empty: !!box.querySelector('.tw-empty'),
        // .tw-c is a dial row; .tw-l holds its name then its value.
        dials: [...box.querySelectorAll('.tw-c .tw-l span:first-child')]
          .map((e) => e.textContent.trim()).filter(Boolean),
      };
    }, sel);
    if (r.err) throw new Error(r.err);
    return r;
  };

  // ---- 1. it answers at all, and says what it climbed to ----
  const drill = await inspect('#presets .drill');
  check('a drill row is not empty', !drill.empty && drill.dials.length > 0, drill.dials.length + ' dials');
  check('a drill row reports its own type', drill.dials.some((d) => /weight|Label|scale/i.test(d)), drill.dials.slice(0, 4).join(' | '));

  // ---- 2. a chevron: size, weight, and now its colour ----
  const caret = await inspect('.band-caret');
  check('a chevron names the element it climbed from', /band-caret/.test(caret.head), caret.head);
  check('chevron offers size and weight',
    caret.dials.includes('Chevron size') && caret.dials.includes('Chevron weight'), caret.dials.slice(0, 3).join(' | '));
  check('chevron offers the colour it actually strokes with',
    caret.dials.includes('Muted lightness'), caret.dials.join(' | ').slice(0, 90));

  const da = await inspect('#drill-acts .da-caret');
  check('the drills-row chevron says the same', da.dials.includes('Muted lightness')
    && da.dials.includes('Chevron size'), da.dials.slice(0, 3).join(' | '));

  // ---- 3. the dial reaches the ink, and the ink reaches the chevron ----
  const before = await p.evaluate(() => getComputedStyle(document.querySelector('.band-caret')).stroke);
  await p.evaluate(() => {
    const el = [...document.querySelectorAll('#tw input[type=range]')]
      .find((r) => (r.closest('label') || r.parentElement).textContent.includes('Muted lightness'));
    if (!el) throw new Error('no Muted lightness dial in the panel');
    el.value = 75;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => getComputedStyle(document.querySelector('.band-caret')).stroke);
  check('dragging it lightens every chevron', before !== after, before + ' -> ' + after);

  // ---- 4. the back-button chevron keeps its own colour ----
  // All three stroke with currentColor on purpose, so each takes the colour of
  // the row it sits in. Flattening that into one chevron colour would turn this
  // one grey.
  await p.evaluate(() => {
    const a = [...document.querySelectorAll('#drill-acts .drill-act')].find((e) => e.querySelector('.da-n'));
    if (a) a.click();
  });
  await p.waitForTimeout(700);
  const page = await p.evaluate(() => {
    const el = document.querySelector('.page-caret');
    if (!el) return null;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return { stroke: getComputedStyle(el).stroke, accent };
  });
  check('the back chevron still follows its row, not the muted ink',
    page && page.stroke !== after, page ? page.stroke + ' vs muted ' + after : 'no .page-caret');

  check('no page errors', errs.length === 0, JSON.stringify(errs));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
