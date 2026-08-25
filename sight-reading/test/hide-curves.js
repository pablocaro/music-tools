// Hide Ahead must take ties and slurs with it. The curtain hides notes,
// beams, stems and ledgers; curves were never in that list, so the notes
// vanished and their slurs stayed floating over blank paper. Rule under
// test: a curve goes the moment its first note goes (the beam rule), so
// mid-play there is never a visible curve left of the per-line cut.
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
(async()=>{
  const b=await chromium.launch({executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8091/',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('#sheet svg',{timeout:20000}); await p.waitForTimeout(900);
  for(let i=0;i<4;i++){ if(await p.$('#ob-next')){await p.click('#ob-next').catch(()=>{});await p.waitForTimeout(200);} }
  await p.click('#settings-toggle'); await p.waitForTimeout(500);
  // slurs of 2 + lots of ties -> plenty of both curve kinds
  await p.evaluate(()=>[...document.querySelectorAll('#bowing-pills .fig-cell')]
    .find(e=>e.dataset.bowing==='2').click());   // the cell draws a glyph, so match the data not the text
  await p.waitForTimeout(900);
  await p.evaluate(()=>[...document.querySelectorAll('#ties-pills .opt')].find(e=>e.textContent.trim()==='Lots').click());
  await p.waitForTimeout(1200);
  await p.evaluate(()=>{ const t=document.getElementById('tempo'); t.value=180; t.dispatchEvent(new Event('change')); });
  // hide ahead on, 1 beat lead
  await p.click('#hide-up'); await p.waitForTimeout(200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);   // close rail so play is visible
  const curveCount = await p.evaluate(()=>document.querySelectorAll('#sheet .vf-curve, #sheet .vf-stavetie').length);
  await p.click('#play'); await p.waitForTimeout(9000);            // count-in + a few bars
  const probe = await p.evaluate(()=>{
    const sheet=document.getElementById('sheet');
    const sys=[...sheet.querySelectorAll('.staffline')];
    const line=e=>sys.indexOf(e.closest('.staffline'));
    const cut=[]; let hiddenNotes=0;
    sheet.querySelectorAll('.vf-stavenote').forEach(n=>{
      if(n.style.visibility==='hidden'){ hiddenNotes++;
        const r=n.getBoundingClientRect(), L=line(n);
        cut[L]=Math.max(cut[L]??-1e9, r.right); }
    });
    let strandedVisible=0, hiddenCurves=0, total=0;
    sheet.querySelectorAll('.vf-curve, .vf-stavetie').forEach(c=>{
      total++;
      const hidden=c.style.visibility==='hidden';
      if(hidden){ hiddenCurves++; return; }
      const L=line(c);
      if(cut[L]!=null && c.getBoundingClientRect().left < cut[L]) strandedVisible++;
    });
    return {hiddenNotes, hiddenCurves, strandedVisible, total};
  });
  console.log('curves in page:', curveCount, '| mid-play:', JSON.stringify(probe),
    '(want hiddenNotes>0, hiddenCurves>0, strandedVisible=0)');
  console.log('errors:', JSON.stringify(errs.filter(e=>!/EncodingError/.test(e))));
  await b.close();
  process.exit(probe.strandedVisible===0 && probe.hiddenCurves>0 ? 0 : 1);
})();
