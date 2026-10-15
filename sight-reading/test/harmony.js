// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);
const { setMusicality } = require('./drills.js');
const LET = { C:0, D:1, E:2, F:3, G:4, A:5, B:6 };

function stats(xml) {
  const prog = [0,3,4,0];
  // note positions with their beat offset inside the bar (quarter notes)
  const bars = xml.split(/<measure[ >]/).slice(1).map(m => {
    const notes = [...m.matchAll(/<note[\s\S]*?<\/note>/g)].map(t => {
      const st = /<step>([A-G])<\/step>/.exec(t), oc = /<octave>(\d)<\/octave>/.exec(t);
      const du = /<duration>(\d+)<\/duration>/.exec(t);
      const rest = /<rest\s*\/?>/.test(t);
      return { d: st?LET[st[1]]:null, pos: st&&oc ? +oc[1]*7+LET[st[1]] : null,
               dur: du?+du[1]:0, rest };
    });
    return notes;
  });
  let on=0, tot=0, onBeat=0, beatTot=0, div=null;
  // divisions per quarter
  const dv = /<divisions>(\d+)<\/divisions>/.exec(xml); div = dv ? +dv[1] : 1;
  bars.forEach((b,i) => {
    // Triad, plus the seventh on the dominant — the engine puts it in V's
    // chord-tone set, so scoring V bars against a bare triad marked every
    // generated seventh as a wrong note and dragged the rate down ~8 points.
    const r = prog[i%4], tones=[r%7,(r+2)%7,(r+4)%7];
    if (r === 4) tones.push((r+6)%7);
    let t = 0;
    b.forEach(n => {
      if (!n.rest && n.d != null) {
        tot++; if (tones.indexOf(n.d)>=0) on++;
        const q = t/div;                                  // quarter-note offset
        if (Math.abs(q - Math.round(q)) < 0.02) { beatTot++; if (tones.indexOf(n.d)>=0) onBeat++; }
      }
      t += n.dur;
    });
  });
  const flat=[].concat(...bars).filter(n=>!n.rest&&n.pos!=null);
  let rep=0; for(let i=1;i<flat.length;i++) if(flat[i].pos===flat[i-1].pos) rep++;
  return { ct: tot?Math.round(100*on/tot):0,
           beat: beatTot?Math.round(100*onBeat/beatTot):0,
           rep: flat.length>1?Math.round(100*rep/(flat.length-1)):0,
           distinct: new Set(flat.map(n=>n.pos)).size, n: flat.length };
}

(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  const p = await (await b.newContext({ viewport:{width:1280,height:900} })).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8091/', { waitUntil:'networkidle' });
  await p.waitForTimeout(2200);
  await p.evaluate(()=>{const P=window.osme.OpenSheetMusicDisplay.prototype,o=P.load;
    P.load=function(x){window.__xml=x;return o.apply(this,arguments);};});
  for (let i=0;i<4;i++){ if(await p.$('#ob-next')){await p.click('#ob-next').catch(()=>{});await p.waitForTimeout(200);} }
  await p.click('#settings-toggle'); await p.waitForTimeout(400);

  // Intervals are fig-cells now, not rows with a slider: a hidden checkbox
  // carries in-or-out and the weight rides in data-w, snapped to the control's
  // two live rungs (2 = on, 4 = x2). The ALPHAS table below still writes the
  // old 1-4 scale, so anything above 2 lands on x2 — the shape of each
  // alphabet survives, the fine gradations between 3 and 4 do not.
  //
  // This went unnoticed because the old selector matched nothing and forEach
  // over an empty list throws nothing: every row of this harness was measuring
  // whichever preset happened to be loaded, not the alphabet it named.
  const setAlpha = (on,w) => p.evaluate(([o,wv])=>{
    [...document.querySelectorAll('#matrix .fig-cell')].forEach((cell,i)=>{
      const cb=cell.querySelector('input[type=checkbox]');
      if(!cb) return;
      const want = o[i] ? ((wv[i]||2) > 2 ? 4 : 2) : 0;
      cb.checked = want > 0;
      cb.dataset.w = want > 0 ? want : 2;
      cb.dispatchEvent(new Event('change'));   // the real path: syncs cell + badge
    });
  },[on,w]);
  const setM = v => setMusicality(p, v > 0, 1300);

  const ALPHAS = {
    '2nds only':     [[0,1,0,0,0,0,0,0],[1,4,1,1,1,1,1,1]],
    'unison + 2nds': [[1,1,0,0,0,0,0,0],[4,4,1,1,1,1,1,1]],
    '3rds (arpeg)':  [[0,1,4,3,2,1,0,0],[1,1,4,3,2,1,1,1]],
    '4ths + 5ths':   [[0,0,0,1,1,0,0,0],[1,1,1,4,4,1,1,1]],
    'wide leaps':    [[0,1,2,3,3,2,1,2],[1,1,2,3,3,2,1,2]],
  };
  // "on the beat" tracks "chord tones" exactly here, and that is arithmetic
  // rather than a bug: this harness varies the alphabet but never the rhythm,
  // and the default figures are quarters and halves, so every note already
  // lands on a beat (measured: 0 off-beat notes out of 53). The column only
  // separates from the first once eighths are in play.
  console.log('alphabet         dial │ chord tones   on the beat   repeats   distinct');
  for (const [name,[on,w]] of Object.entries(ALPHAS)) {
    for (const v of [0, 100]) {
      await setAlpha(on,w); await p.waitForTimeout(250);
      await setM(v); await p.waitForTimeout(1300);
      const s = stats(await p.evaluate(()=>window.__xml));
      console.log(`${name.padEnd(15)} ${String(v).padStart(4)} │    ${String(s.ct).padStart(3)}%          ${String(s.beat).padStart(3)}%       ${String(s.rep).padStart(3)}%       ${String(s.distinct).padStart(2)}`);
    }
  }
  console.log('errors:', errs);
  await b.close();
})();
