// Environment: PW points at a playwright install, CHROMIUM at a browser binary.
const PW = process.env.PW || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = require(PW);
const SP = __dirname + '/out/';
(async()=>{
  const b=await chromium.launch({executablePath: CHROMIUM});
  const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8091/',{waitUntil:'networkidle'}); await p.waitForTimeout(2400);
  for(let i=0;i<4;i++){ if(await p.$('#ob-next')){await p.click('#ob-next').catch(()=>{});await p.waitForTimeout(200);} }
  await p.click('#accomp-toggle'); await p.waitForTimeout(400);
  console.log('pill label :', await p.evaluate(()=>document.getElementById('voice-btn').textContent));

  await p.click('#voice-btn'); await p.waitForTimeout(350);
  const m = await p.evaluate(()=>{ const el=document.getElementById('voice-menu');
    const r=el.getBoundingClientRect();
    return { open:!el.hidden, items:[...el.children].map(c=>c.textContent),
             marked:[...el.children].filter(c=>c.classList.contains('on')).map(c=>c.textContent),
             clipped: r.right>innerWidth || r.bottom>innerHeight || r.left<0,
             visible: !!el.offsetParent && r.width>0 }; });
  console.log('menu       :', JSON.stringify(m));
  await p.screenshot({path: SP + 'm-open.png'});

  // pick one
  await p.evaluate(()=>[...document.querySelectorAll('#voice-menu .menu-item')].find(i=>i.textContent==='Marimba').click());
  await p.waitForTimeout(400);
  console.log('after pick :', await p.evaluate(()=>({ pill:document.getElementById('voice-btn').textContent,
    value:document.getElementById('instrument').value, menuOpen:!document.getElementById('voice-menu').hidden })));
  await p.screenshot({path: SP + 'm-picked.png'});

  // tap elsewhere in the popover closes the menu but keeps the popover
  await p.click('#voice-btn'); await p.waitForTimeout(300);
  await p.evaluate(()=>document.querySelector('#accomp-pop .sec-h').click()); await p.waitForTimeout(300);
  console.log('tap in pop :', await p.evaluate(()=>({ menu:!document.getElementById('voice-menu').hidden,
    pop:!document.getElementById('accomp-pop').hidden })), '(menu closed, pop open)');

  // survives reload, and translates
  await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(2400);
  for(let i=0;i<4;i++){ if(await p.$('#ob-next')){await p.click('#ob-next').catch(()=>{});await p.waitForTimeout(200);} }
  await p.click('#accomp-toggle'); await p.waitForTimeout(400);
  console.log('after load :', await p.evaluate(()=>({ pill:document.getElementById('voice-btn').textContent,
    value:document.getElementById('instrument').value })));
  await p.click('#settings-toggle'); await p.waitForTimeout(400);
  await p.evaluate(()=>document.querySelector('#lang-pills [data-lang="es"]').click()); await p.waitForTimeout(900);
  await p.click('#settings-toggle'); await p.waitForTimeout(400);
  await p.click('#accomp-toggle'); await p.waitForTimeout(300);
  await p.click('#voice-btn'); await p.waitForTimeout(350);
  console.log('es menu    :', await p.evaluate(()=>[...document.querySelectorAll('#voice-menu .menu-item')].map(i=>i.textContent)));
  console.log('es pill    :', await p.evaluate(()=>document.getElementById('voice-btn').textContent));
  console.log('errors:', errs);
  await b.close();
})();
