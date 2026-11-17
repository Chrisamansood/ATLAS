import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || undefined});
const ctx=await browser.newContext({viewport:{width:1440,height:1000}}); const page=await ctx.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.ATLAS_TEST_URL ?? 'http://localhost:3510/ATLAS/';
await page.goto(base); await page.waitForFunction(()=>navigator.serviceWorker.controller); await page.waitForTimeout(1500);
const api=async(path,body)=>page.evaluate(async({base,path,body})=>{const r=await fetch(base+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);if(!r.ok)throw new Error(`${path}: ${r.status} ${await r.text()}`);return r.json()},{base,path,body});
const hive=await api('data/hive.json'); assert.equal(hive.synthetic,true);
for(const sec of hive.sections)for(const item of sec.items){await page.goto(new URL(item.href,base).href);await page.waitForTimeout(350);assert.doesNotMatch(await page.locator('body').innerText(),/ATLAS demo could not start|^not found|^error:/);}
console.log('All navigation screens loaded');
for(const theme of ['sphere','globe','hud','constellation','swarm']){await page.goto(base+'hive/?theme='+theme);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.HIVE_THEMES.current),theme);}
console.log('All five themes loaded');
await page.getByRole('button',{name:/Theme Swarm/i}).click();await page.getByRole('menuitemradio',{name:'Sphere',exact:true}).click();await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.HIVE_THEMES.current),'sphere');
await page.goto(base+'twin/');await page.getByRole('button',{name:'Replay on 10,000 customers'}).click();await page.waitForTimeout(700);assert.ok((await api('twin/api/replay?agent=bill-shock&gate=false')).baseline);console.log('Replay UI and gate-off path work');
await page.goto(base+'twin/live/#sandbox');await page.getByRole('button',{name:'Call as unknown agent'}).click();await page.waitForTimeout(300);assert.match(await page.locator('body').innerText(),/refused|401/i);
await page.getByLabel('Amount EUR',{exact:true}).fill('200');await page.getByRole('button',{name:'Grant credit',exact:true}).click();await page.waitForTimeout(300);
let state=await api('twin/api/live/state');assert.ok(state.calls.length>0);const seq=state.seq;
await page.reload();await page.waitForTimeout(400);assert.equal((await api('twin/api/live/state')).seq,seq);
console.log('Sandbox UI and reload persistence work',state.approvals.length);
if(state.approvals.length){let a=state.approvals.find(a=>a.status==='pending');if(a){assert.equal((await api('twin/api/live/approve',{approval:a.id,by:'Website test'})).ok,true);}}
const second=await browser.newContext();const p2=await second.newPage();await p2.goto(base);await p2.waitForFunction(()=>navigator.serviceWorker.controller);await p2.waitForTimeout(800);assert.equal(await p2.evaluate(async b=>(await(await fetch(b+'twin/api/live/state')).json()).seq,base),0);await second.close();console.log('Visitors have isolated state');
await api('twin/api/live/reset',{});assert.equal((await api('twin/api/live/state')).credits,0);
await page.goto(base+'ontology/?industry=banking');await page.waitForTimeout(500);assert.match(await page.locator('body').innerText(), /Aurora Bank/);
await page.goto(base+'twin/live/#apis'); await page.getByRole('button',{name:'Try it',exact:true}).first().click(); await page.waitForTimeout(400); assert.doesNotMatch(await page.locator('body').innerText(), /Could not call|API answered/); await page.getByRole('button',{name:'Contract',exact:true}).first().click(); await page.waitForTimeout(300);
await page.setViewportSize({width:390,height:844});await page.goto(base);await page.waitForTimeout(500);await page.screenshot({path:'/tmp/atlas-pages-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
assert.deepEqual(errors,[]);console.log('PASS: browser flows, no JavaScript errors');await browser.close();
