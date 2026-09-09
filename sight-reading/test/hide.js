// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);
(async()=>{
  const b=await chromium.launch({executablePath: CHROMIUM});
  const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8091/',{waitUntil:'networkidle'}); await p.waitForTimeout(1000);
  await p.evaluate(()=>{ const P=window.osme.OpenSheetMusicDisplay.prototype,o=P.load;
    P.load=function(x){ window.__xml=x; return o.apply(this,arguments); }; });
  await p.waitForTimeout(1600);
  for(let i=0;i<4;i++){ if(await p.$('#ob-next')){await p.click('#ob-next').catch(()=>{});await p.waitForTimeout(200);} }
  await p.click('#settings-toggle'); await p.waitForTimeout(400);
  await p.evaluate(()=>{ const t=document.getElementById('tempo'); t.value=160; t.dispatchEvent(new Event('change'));
    const m=document.getElementById('measures'); m.value='8'; m.dispatchEvent(new Event('change'));
    const c=document.getElementById('click-on'); if(c && !c.checked){c.checked=true;c.dispatchEvent(new Event('change'));} });
  await p.waitForTimeout(1200);

  // Meter is a set of fig-cells now, not a row of pills: light the one asked
  // for, then clear the rest, in that order — the control clamps at one and
  // will not let itself be emptied.
  const setMeter = m => p.evaluate(x=>{
    const cells=[...document.querySelectorAll('#timesig-pills .fig-cell')];
    const want=cells.find(c=>c.textContent.trim()===x);
    if(!want) throw new Error('no meter "'+x+'" — have: '+cells.map(c=>c.textContent.trim()).join(', '));
    if(!want.classList.contains('on')) want.click();
    cells.forEach(c=>{ if(c!==want && c.classList.contains('on')) c.click(); });
  }, m);

  // note onsets in quarter-beats, absolute from the start of the line
  const onsets = () => p.evaluate(()=>{
    const xml=window.__xml, dv=/<divisions>(\d+)<\/divisions>/.exec(xml), div=dv?+dv[1]:1;
    const out=[]; let acc=0;
    xml.split(/<measure[ >]/).slice(1).forEach(m=>{
      let t=0;
      [...m.matchAll(/<note[\s\S]*?<\/note>/g)].forEach(tag=>{
        const du=/<duration>(\d+)<\/duration>/.exec(tag);
        out.push(acc + t/div); t += du?+du[1]:0;
      });
      acc += t/div;
    });
    return out;
  });

  for (const [meter,unit,n,q] of [['4/4','beats',1,1], ['4/4','measures',1,4],
                                  ['6/8','beats',1,1.5], ['6/8','measures',1,3]]) {
    await setMeter(meter); await p.waitForTimeout(1300);
    // The switch owns on/off now, and the stepper is not even in the DOM flow
    // while it is off — so turning the curtain on by clicking + no longer
    // works. It did not fail, either: the run stayed green and every row
    // reported "distinct hidden counts 1", a curtain that never moved.
    await p.evaluate(([uu,nn])=>{
      const sw = document.getElementById('hide-toggle');
      if (document.getElementById('hide-behind').checked !== true) sw.click();
      document.getElementById('hide-unit').dataset.unit=uu;
      const v=document.getElementById('hide-val');
      const cur = parseInt(v.dataset.n,10)||1;
      for(let i=cur;i<nn;i++) document.getElementById('hide-up').click();
      for(let i=cur;i>nn;i--) document.getElementById('hide-down').click();
    },[unit,n]);
    await p.waitForTimeout(700);
    const armed = await p.evaluate(()=>({on:document.getElementById('hide-behind').checked,
      n:document.getElementById('hide-val').textContent.trim(),
      lead:document.getElementById('hide-lead').value}));
    if (!armed.on || +armed.lead <= 0) throw new Error('curtain not armed: '+JSON.stringify(armed));
    const ons = await onsets();
    // every hideCount reachable by a quantised edge
    const valid = new Set();
    for (let m=0; m*q <= ons[ons.length-1]+q; m++) valid.add(ons.filter(o=>o < m*q-1e-6).length);

    await p.click('#play');
    const seen=new Set(); let bad=0, countdowns=[];
    for(let i=0;i<34;i++){ await p.waitForTimeout(230);
      const r=await p.evaluate(()=>({
        hidden:[...document.querySelectorAll('#sheet .vf-stavenote')].filter(n=>n.style.visibility==='hidden').length,
        cd:(()=>{const c=document.getElementById('countdown'); return c && !c.hidden ? c.textContent : null;})() }));
      if (r.cd!=null && !countdowns.includes(r.cd)) countdowns.push(r.cd);
      if (!seen.has(r.hidden)) { seen.add(r.hidden); if(!valid.has(r.hidden)) bad++; }
    }
    await p.click('#play').catch(()=>{}); await p.waitForTimeout(400);
    console.log(`${meter} ${String(n)} ${unit.padEnd(8)} q=${q} │ distinct hidden counts ${seen.size}, off-boundary ${bad} │ count-in showed ${countdowns.join(',')||'—'}`);
  }
  console.log('errors:', errs);
  await b.close();
})();
