// What the walk does at the seams — the measurement side of the musical-lines
// work. No assertions: this harness exists to put numbers on things the ear
// reports vaguely ("the transitions feel rough"), so that each engine change
// can show its target metric moved AND its fingerprint metrics did not.
//
// Reported per preset × dial setting:
//
//   seam     — at every barline where the chord changes: how far the line
//              jumped (last note → first note) against the nearest tone of the
//              incoming chord that was available in either direction, and how
//              often it took a jump no wider than that nearest option.
//   anchor   — the same seam measured between on-beat notes only, in case the
//              roughness lives at the structural level rather than the surface
//              (the last note of a bar is often an off-beat passing tone).
//   obliged  — the general tendency-tone case: seams whose last note belonged
//              to the old chord but not the new one, and how often it resolved
//              (landed on a new-chord tone no further than the nearest one).
//   lead/7th — the two famous instances, V bars only: a leading tone (degree
//              6) at the seam moving up by step, a chord seventh (degree 3)
//              falling by step. Counts are small; read the rate with the n.
//   shape    — the fingerprint: same/step/3rd/wider shares and the mean length
//              of a same-direction run. These are the numbers that must NOT
//              move when a seam rule lands.
//
//   node sight-reading/test/melody.js        (GENS=n to change sample size)
//
// DIALS=0,20,40,60,80,100 sweeps the musicality dial instead of the default
// two ends, which is how you ask whether the middle of that control is a real
// place or just a blend of the ends. (It is real: the step share peaks around
// 40-60 and falls again by 100, so the middle is the most scalar setting and
// the top brings chordal leaps back.)
// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);
const BASE = 'http://localhost:8091/index.html';
const GENS = +process.env.GENS || 18;

const LET = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const DOMINANT = 4;
// Scale-degree roots per progression id, mirroring PROGRESSIONS in app.js —
// the harness reads the select's id at runtime so a preset that changes its
// progression keeps being scored against the chords it actually uses.
const ROOTS = {
  'I-IV-V-I':   [0, 3, 4, 0],
  'I-V-vi-IV':  [0, 4, 5, 3],
  'ii-V-I':     [1, 4, 0],
  'i-iv-V-i':   [0, 3, 4, 0],
  'i-VI-VII-i': [0, 5, 6, 0],
  'i-VII-VI-V': [0, 6, 5, 4]
};

function chordOf(root) {
  const c = [root % 7, (root + 2) % 7, (root + 4) % 7];
  if (root === DOMINANT) c.push((root + 6) % 7);   // the seventh, as the engine does
  return c;
}

// Bars of sounding notes, each with absolute staff position, scale degree and
// beat offset. Rests are dropped after stamping beats, so `beat` stays true to
// the bar even when the downbeat itself is silent.
function parse(xml, tonic) {
  const dv = /<divisions>(\d+)<\/divisions>/.exec(xml);
  const div = dv ? +dv[1] : 1;
  return xml.split(/<measure[ >]/).slice(1).map((m) => {
    const notes = [...m.matchAll(/<note[\s\S]*?<\/note>/g)].map((t) => {
      const st = /<step>([A-G])<\/step>/.exec(t), oc = /<octave>(\d)<\/octave>/.exec(t);
      const du = /<duration>(\d+)<\/duration>/.exec(t);
      return { pos: st && oc ? +oc[1] * 7 + LET[st[1]] : null,
               deg: st ? ((LET[st[1]] - tonic) % 7 + 7) % 7 : null,
               dur: du ? +du[1] : 0,
               rest: /<rest\s*\/?>/.test(t) };
    });
    let t = 0;
    for (const n of notes) { n.beat = t / div; t += n.dur; }
    return notes;   // rests kept — adjacency tests need to see them
  });
}

function newAcc() {
  return { moves: 0, iv: { same: 0, step: 0, third: 0, wide: 0 }, runs: [], run: 0, lastSgn: 0,
           seam: { n: 0, jump: 0, near: 0, opt: 0 }, anchor: { n: 0, jump: 0 },
           ob: { n: 0, jump: 0, res: 0 }, lead: { n: 0, res: 0 }, sev: { n: 0, res: 0 },
           starts: [], q: { n: 0, tone: 0, root: 0 }, ans: { n: 0, tone: 0, root: 0 },
           nct: { n: 0, ok: 0 }, off: { n: 0, step: 0 }, ctr: { n: 0, hit: 0 } };
}

function collect(xml, tonic, roots, a) {
  const evBars = parse(xml, tonic);
  const bars = evBars.map((b) => b.filter((n) => !n.rest && n.pos != null));

  // Fingerprint over the whole line (each note keeps its bar for chord tests).
  const flat = [];
  bars.forEach((b, bi) => b.forEach((n) => flat.push({ pos: n.pos, deg: n.deg, beat: n.beat, bar: bi })));

  // Non-chord tones and how they are treated. A non-chord tone with a job —
  // passing or neighbour — is entered by step and left by step. Judged over
  // the EVENT stream, rests included: a dissonance beside silence has no line
  // to judge, so it is excluded rather than failed. Also: of all moves that
  // LAND off the beat, how many are steps — leaps belong to the beats and the
  // chords, and the space between the beats is stepwise business.
  const evFlat = [];
  evBars.forEach((b, bi) => b.forEach((n) => evFlat.push({ pos: n.pos, deg: n.deg, beat: n.beat, rest: n.rest, bar: bi })));
  const isNote = (e) => e && !e.rest && e.pos != null;
  for (let i = 1; i < evFlat.length - 1; i++) {
    const n = evFlat[i];
    if (!isNote(n)) continue;
    const pv = evFlat[i - 1], nx = evFlat[i + 1];
    if (!chordOf(roots[n.bar % roots.length]).includes(n.deg)) {
      if (!isNote(pv) || !isNote(nx)) continue;
      a.nct.n++;
      const inOk = Math.abs(n.pos - pv.pos) === 1;
      const outOk = Math.abs(nx.pos - n.pos) === 1;
      if (inOk) a.nct.in = (a.nct.in || 0) + 1;
      if (outOk) a.nct.out = (a.nct.out || 0) + 1;
      if (inOk && outOk) a.nct.ok++;
    }
    if (Math.abs(n.beat - Math.round(n.beat)) >= 0.02 && isNote(pv)) {
      a.off.n++;
      if (Math.abs(n.pos - pv.pos) === 1) a.off.step++;
    }
  }
  // The opening note — one per exercise. Distinct starts across a batch is
  // the anti-tell metric; membership in the first bar's chord is the musical
  // one (only expected once the dial is up).
  if (flat.length) a.starts.push({ pos: flat[0].pos, tone: chordOf(roots[0]).includes(flat[0].deg) });
  for (let i = 1; i < flat.length; i++) {
    const g = flat[i].pos - flat[i - 1].pos, ab = Math.abs(g);
    a.iv[ab === 0 ? 'same' : ab === 1 ? 'step' : ab === 2 ? 'third' : 'wide']++;
    a.moves++;
    const s = Math.sign(g);
    if (s !== 0 && s === a.lastSgn) a.run++;
    else { if (a.run > 0) a.runs.push(a.run); a.run = s !== 0 ? 1 : 0; }
    if (s !== 0) a.lastSgn = s;
  }
  if (a.run > 0) { a.runs.push(a.run); a.run = 0; a.lastSgn = 0; }

  // Contour memory: how much of the phrase-start bar's shape returns in the
  // two bars that may echo it. In-bar delta sequences compared at the same
  // ordinal against the phrase's opening bar; the cadence bar is excluded —
  // it answers to the cadence, not the motif.
  for (let p = 0; p + 3 < bars.length; p += 4) {
    const dseq = (b) => b.slice(1).map((n, j) => n.pos - b[j].pos);
    const base = dseq(bars[p]);
    if (base.length < 2) continue;
    for (let k = 1; k <= 2; k++) {
      const d = dseq(bars[p + k]);
      const m = Math.min(base.length, d.length);
      for (let j = 0; j < m; j++) {
        a.ctr.n++;
        if (d[j] === base[j]) a.ctr.hit++;
        if (Math.sign(d[j]) === Math.sign(base[j])) a.ctr.dir = (a.ctr.dir || 0) + 1;
      }
    }
  }

  // Phrase endings — the question/answer split. A phrase-end bar's last note
  // scored against that bar's own chord: the root is a close, another chord
  // tone leaves the phrase open, anything else is neither. First and third
  // phrases are the questions; second, fourth and the final bar answer.
  for (let i = 0; i < bars.length; i++) {
    const isLast = i === bars.length - 1;
    if (i % 4 !== 3 && !isLast) continue;
    const bar = bars[i];
    if (!bar.length) continue;
    const r = roots[i % roots.length], t = chordOf(r);
    const d = bar[bar.length - 1].deg;
    const slot = (Math.floor(i / 4) % 2 === 0 && !isLast) ? a.q : a.ans;
    slot.n++;
    if (t.includes(d)) { slot.tone++; if (d === r % 7) slot.root++; }
  }

  // Seams.
  for (let i = 1; i < bars.length; i++) {
    const A = bars[i - 1], B = bars[i];
    if (!A.length || !B.length) continue;
    const pr = roots[(i - 1) % roots.length], cr = roots[i % roots.length];
    if (pr === cr) continue;                       // no chord change, no seam
    const prev = chordOf(pr), cur = chordOf(cr);
    const from = A[A.length - 1], to = B[0];
    const jump = Math.abs(to.pos - from.pos);

    let near = 9;
    for (let d = 1; d <= 7 && near === 9; d++) {
      if (cur.includes(((from.deg + d) % 7 + 7) % 7) ||
          cur.includes(((from.deg - d) % 7 + 7) % 7)) near = d;
    }
    a.seam.n++; a.seam.jump += jump; a.seam.near += near;
    if (jump <= near) a.seam.opt++;

    const la = [...A].reverse().find((n) => Math.abs(n.beat - Math.round(n.beat)) < 0.02);
    const fb = B.find((n) => Math.abs(n.beat - Math.round(n.beat)) < 0.02);
    if (la && fb) { a.anchor.n++; a.anchor.jump += Math.abs(fb.pos - la.pos); }

    if (prev.includes(from.deg) && !cur.includes(from.deg)) {
      a.ob.n++; a.ob.jump += jump;
      if (jump <= near && cur.includes(to.deg)) a.ob.res++;
    }
    if (pr === DOMINANT) {
      const d = to.pos - from.pos;
      if (from.deg === 6) { a.lead.n++; if (d === 1) a.lead.res++; }
      if (from.deg === 3) { a.sev.n++; if (d === -1) a.sev.res++; }
    }
  }
}

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);
  await p.evaluate(() => { const P = window.osme.OpenSheetMusicDisplay.prototype, o = P.load;
    P.load = function (x) { window.__xml = x; return o.apply(this, arguments); }; });
  for (let i = 0; i < 4; i++) {
    if (await p.$('#ob-next')) { await p.click('#ob-next').catch(() => {}); await p.waitForTimeout(200); }
  }
  await p.click('#settings-toggle'); await p.waitForTimeout(400);

  const setDial = (v) => p.evaluate((x) => { const M = document.getElementById('musicality');
    M.value = x; M.dispatchEvent(new Event('input')); M.dispatchEvent(new Event('change')); }, v);

  console.log(`${GENS} exercises per row.  jump/near in staff steps; opt = took a jump no wider than the nearest option.`);
  console.log('preset            dial │ seam jump near  opt │ anchr │ obliged n res │ lead n res │ 7th n res │ same/step/3rd/wide │ run │ starts d tone │ Qopen Aclose │ nct n ok offstep │ ctr');

  for (const [label, rx] of [['Arpeggios', 'arpegg'], ['Mixed Intervals', 'mixed int'], ['Minor Cadences', 'caden']]) {
    await p.evaluate((r) => {
      const el = [...document.querySelectorAll('#presets .pill')].find((e) => new RegExp(r, 'i').test(e.textContent));
      if (el) el.click();
    }, rx);
    await p.waitForTimeout(1100);
    const tonic = await p.evaluate(() => parseInt(document.getElementById('key-tonic').value, 10));
    const progId = await p.evaluate(() => document.getElementById('progression').value);
    const roots = ROOTS[progId];
    if (!roots) { console.log(`${label}: unknown progression ${progId}`); continue; }

    for (const dial of (process.env.DIALS ? process.env.DIALS.split(',').map(Number) : [0, 100])) {
      await setDial(dial); await p.waitForTimeout(400);
      const a = newAcc();
      for (let k = 0; k < GENS; k++) {
        await p.evaluate(() => document.getElementById('generate').click());
        await p.waitForTimeout(650);
        collect(await p.evaluate(() => window.__xml), tonic, roots, a);
      }
      const f = (x, w = 4) => String(x).padStart(w);
      const pc = (x, n) => n ? Math.round(100 * x / n) + '%' : '—';
      const avg = (x, n, d = 2) => n ? (x / n).toFixed(d) : '—';
      const mrun = a.runs.length ? (a.runs.reduce((x, y) => x + y, 0) / a.runs.length).toFixed(2) : '—';
      const sd = new Set(a.starts.map((s) => s.pos)).size;
      const st = pc(a.starts.filter((s) => s.tone).length, a.starts.length);
      const qo = pc(a.q.tone - a.q.root, a.q.n), ac = pc(a.ans.root, a.ans.n);
      const nc = pc(a.nct.ok, a.nct.n), os = pc(a.off.step, a.off.n);
      const ni = pc(a.nct.in || 0, a.nct.n), no = pc(a.nct.out || 0, a.nct.n);
      const ct = pc(a.ctr.hit, a.ctr.n), cd = pc(a.ctr.dir || 0, a.ctr.n);
      console.log(`${label.padEnd(16)} ${f(dial)} │ ${f(avg(a.seam.jump, a.seam.n))} ${f(avg(a.seam.near, a.seam.n))} ${f(pc(a.seam.opt, a.seam.n))} │ ${f(avg(a.anchor.jump, a.anchor.n))} │ ${f(a.ob.n, 6)} ${f(pc(a.ob.res, a.ob.n))} │ ${f(a.lead.n, 3)} ${f(pc(a.lead.res, a.lead.n))} │ ${f(a.sev.n, 2)} ${f(pc(a.sev.res, a.sev.n))} │ ${f(pc(a.iv.same, a.moves), 3)} ${f(pc(a.iv.step, a.moves), 4)} ${f(pc(a.iv.third, a.moves), 4)} ${f(pc(a.iv.wide, a.moves), 4)} │ ${mrun} │ ${f(sd, 2)} ${f(st, 4)} │ ${f(qo, 4)} ${f(ac, 4)} │ ${f(a.nct.n, 4)} ${f(nc, 4)} in${f(ni, 4)} out${f(no, 4)} ${f(os, 4)} │ ${f(ct, 4)} dir${f(cd, 4)}`);
    }
  }
  console.log('errors:', errs);
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
