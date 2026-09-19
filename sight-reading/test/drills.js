// Shared helpers for the Drills band.
//
// The band shows three rows, not every drill, so "click the preset named X" is
// no longer one selector — anything outside the three lives behind the All
// drills page. Every harness that used to reach for `.presets .pill` goes
// through here instead, and each helper says which surface it found the drill
// on so a test can print it.

function names(sel) {
  return [...document.querySelectorAll(sel)]
    .map((e) => e.querySelector('.drill-name').textContent.trim());
}

// Applies the drill and waits for the regenerate. Returns 'band' or 'page' —
// which one it was is worth logging, because a drill that fell out of the band
// changes what the test is exercising. Throws with the full list on a miss, so
// a rename dates the harness loudly instead of as "cannot read 'click'".
async function pickDrill(p, name, wait) {
  const inBand = await p.evaluate((n) => {
    const row = [...document.querySelectorAll('#presets .drill')].find((e) =>
      e.querySelector('.drill-name').textContent.trim().startsWith(n));
    if (!row) return false;
    row.click();
    return true;
  }, name);
  if (inBand) { await p.waitForTimeout(wait || 1000); return 'band'; }

  // The count badge marks the All drills row without depending on its glyph.
  await p.evaluate(() => {
    const act = [...document.querySelectorAll('#drill-acts .drill-act')]
      .find((a) => a.querySelector('.da-n'));
    if (!act) throw new Error('no All drills row in the drill actions');
    act.click();
  });
  await p.waitForTimeout(400);
  const hit = await p.evaluate((n) => {
    const all = [...document.querySelectorAll('#all-drills-list .drill')];
    const row = all.find((e) => e.querySelector('.drill-name').textContent.trim().startsWith(n));
    if (!row) {
      return all.map((e) => e.querySelector('.drill-name').textContent.trim()).join(', ');
    }
    row.click();
    return null;
  }, name);
  if (hit !== null) throw new Error(`no drill "${name}" — have: ${hit}`);
  await p.waitForTimeout(wait || 1000);
  return 'page';
}

// Saves the current panel under a name. The ＋ row is "New drill" on a clean
// drill and "Save …" once you have edited one; both save, so match the glyph.
async function newDrill(p, name) {
  await p.evaluate((n) => {
    window.prompt = () => n;
    const act = [...document.querySelectorAll('#drill-acts .drill-act')].find(
      (e) => e.querySelector('.da-ic').textContent === '＋');
    if (!act) throw new Error('no save row in the drill actions');
    act.click();
  }, name);
  await p.waitForTimeout(500);
}

// Musicality is a switch, not a dial: 0 or 100 and nothing between. Drives the
// visible control, so the panel's dependents (the progression pills, the chord
// names row) follow the same way they do under a finger — poking the hidden
// input directly leaves the switch and its section disagreeing with the engine.
async function setMusicality(p, on, wait) {
  const changed = await p.evaluate((want) => {
    const el = document.getElementById('musicality');
    const btn = document.getElementById('musicality-toggle');
    if (!btn) throw new Error('no musicality switch');
    const now = (+el.value) > 0;
    if (now !== want) { btn.click(); return true; }
    return false;
  }, !!on);
  await p.waitForTimeout(changed ? (wait || 1400) : 100);
  return changed;
}

// The key set, driven through the subtitle's picker — the same menu a finger
// reaches, so the rotation index and the panel's derived #key-tonic / #key-mode
// follow the way they do for a user. Labels are the menu's own: 'C', 'Am',
// 'F♯', 'B♭m'. Wanted keys are ticked before unwanted ones are unticked, so
// the floor of one never blocks a swap. Each click regenerates, so this waits
// per toggle; returns how many it made.
async function setKeys(p, labels, wait) {
  await p.click('#sh-sub .pick[data-pick="keys"]');
  await p.waitForTimeout(250);
  const plan = await p.evaluate((want) => {
    const items = [...document.querySelectorAll('#pick-menu .menu-item')]
      .map((e) => ({ label: e.textContent.replace(/[●\s]/g, ''), on: e.classList.contains('on') }));
    const known = items.map((i) => i.label);
    want.forEach((w) => { if (known.indexOf(w) < 0) throw new Error('no key "' + w + '" in the picker — have: ' + known.join(' ')); });
    const tick = items.filter((i) => !i.on && want.indexOf(i.label) >= 0).map((i) => i.label);
    const untick = items.filter((i) => i.on && want.indexOf(i.label) < 0).map((i) => i.label);
    return tick.concat(untick);
  }, labels);
  for (const label of plan) {
    await p.evaluate((l) => {
      const it = [...document.querySelectorAll('#pick-menu .menu-item')]
        .find((e) => e.textContent.replace(/[●\s]/g, '') === l);
      if (!it) throw new Error('picker lost item ' + l + ' mid-way');
      it.click();
    }, label);
    await p.waitForTimeout(wait || 1200);
  }
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  return plan.length;
}

// The instrument, through the picker in the panel's Instrument section. Opens
// the panel if it is shut, because that is where the control lives now — it
// spent one release in the wordmark and moved back. Name as the menu shows
// it: 'Cello', 'Viola'.
async function setInstrument(p, name, wait) {
  const opened = await p.evaluate(() => {
    if (document.querySelector('.layout.panel-open')) return false;
    document.getElementById('settings-toggle').click();
    return true;
  });
  if (opened) await p.waitForTimeout(600);
  await p.evaluate(() => document.getElementById('instr-cycle').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(200);
  await p.click('#instr-cycle');
  await p.waitForTimeout(250);
  await p.evaluate((n) => {
    const it = [...document.querySelectorAll('#pick-menu .menu-item')]
      .find((e) => e.textContent.replace(/[●\s]/g, '') === n);
    if (!it) throw new Error('no instrument "' + n + '" in the picker');
    it.click();
  }, name);
  await p.waitForTimeout(wait || 1200);
}

module.exports = { pickDrill, newDrill, names, setMusicality, setKeys, setInstrument };
