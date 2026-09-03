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

module.exports = { pickDrill, newDrill, names, setMusicality };
