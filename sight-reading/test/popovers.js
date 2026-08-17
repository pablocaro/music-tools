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

  const probe = id => p.evaluate(x=>{
    const el=document.getElementById(x), cs=getComputedStyle(el);
    const rows=[...el.querySelectorAll('.pop-row')].map(r=>{
      // Not lastElementChild: the Voice row carries its own listbox after the
      // button, so that measured a hidden menu at 0 and the accomp popover's
      // alignment check could never pass. Ask for the control by what it is.
      const lab=r.querySelector('.pop-label');
      const ctl=r.querySelector('.sw, .cycle, input[type="range"]');
      return { label: lab?lab.textContent:null,
               ctlRight: Math.round(ctl.getBoundingClientRect().right) };
    });
    return { radius: cs.borderRadius, shadow: cs.boxShadow.slice(0,28),
             head: el.querySelector('.sec-h')?.textContent,
             rows, popRight: Math.round(el.getBoundingClientRect().right) };
  }, id);

  await p.click('#metro-toggle'); await p.waitForTimeout(400);
  const pace = await probe('pace-pop');
  console.log('pace  ', JSON.stringify(pace));
  await p.screenshot({path: SP + 'p-pace.png'});
  await p.click('#accomp-toggle'); await p.waitForTimeout(400);
  const acc = await probe('accomp-pop');
  console.log('accomp', JSON.stringify(acc));
  await p.screenshot({path: SP + 'p-accomp.png'});

  const gap = await p.evaluate(()=>getComputedStyle(document.querySelector('.tb-actions')).gap);
  console.log('header button gap:', gap);
  // do the controls share one right edge?
  const edges = [...pace.rows, ...acc.rows].map(r=>r.ctlRight);
  console.log('control right edges:', edges.join(' '), '| aligned within pop:',
    new Set(pace.rows.map(r=>r.ctlRight)).size === 1,
    new Set(acc.rows.map(r=>r.ctlRight)).size === 1);
  console.log('errors:', errs);
  await b.close();
})();
