/* Real browser UI with fixture APIs; never calls a paid provider.
   Start next dev on 3105, then set PLAYWRIGHT_MODULE if Playwright is not on NODE_PATH. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const ts = require('typescript'), repo = path.resolve(__dirname, '..');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3105';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local test server required');
const cache = new Map();
function load(file) { file = path.resolve(file); if (cache.has(file)) return cache.get(file); const m = { exports: {} }; cache.set(file,m.exports); new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id)+'.ts'):require(id),m,m.exports);cache.set(file,m.exports);return m.exports; }
const catalog = load(path.join(repo, 'lib/businessModelCatalog.ts')).buildBusinessModelCatalog({ data: [{ id: 'gpt-image-2' }, { id: 'SIRAYA-Seedance-2.5' }] });
const uid = '11111111-1111-4111-8111-111111111111';
const fixture = (id, kind, status, extra = {}) => ({ id, kind, model: kind === 'video' ? 'SIRAYA-Seedance-2.5' : 'gpt-image-2', status, prompt: `Campaign ${id}`, nsfw: false, createdAt: new Date(Date.UTC(2026, 10, 5, 12, Number(id) || 0)).toISOString(), ...extra });
(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    for (const locale of ['zh-Hant', 'zh-Hans', 'en', 'ja']) {
      const c = load(path.join(repo, 'lib/i18n/businessResults.ts')).businessResultsCopy(locale);
      const s = load(path.join(repo, 'lib/i18n/businessStudio.ts')).businessStudioCopy(locale);
      const { businessCopy, businessError } = load(path.join(repo, 'lib/i18n/business.ts'));
      const t = businessCopy(locale);
      const priceCopy = load(path.join(repo, 'lib/i18n/businessPricePreview.ts')).businessPricePreviewCopy(locale);
      const { work } = load(path.join(repo, 'lib/i18n/businessOperations.ts')).businessOperationsCopy(locale);
      const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, permissions: ['clipboard-read', 'clipboard-write'] });
      await context.addCookies([{ name: 'bw_lang', value: locale, url: base }]);
      const page = await context.newPage(); page.setDefaultNavigationTimeout(120000); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let posts = 0, polls = 0, exactReads = 0, showSecond = false, releaseAcceptance, signalAcceptance;
      let quotes = 0;
      const acceptanceStarted = new Promise(resolve => { signalAcceptance = resolve; });
      let jobs = [fixture('3', 'image', 'completed', { images: [{url: '/home-films/worlds.jpg'}, {url: '/home-films/art.jpg'}] }), fixture('2', 'video', 'completed', { videoUrl: '/home-films/worlds.mp4' }), fixture('1', 'image', 'failed', {errorCode: 'generation_failed'})];
      await page.route('**/*', async route => {
        const url = new URL(route.request().url()), p = url.pathname;
        if (url.origin !== base) return route.abort();
        if (!p.startsWith('/api/')) return route.continue();
        const json = body => route.fulfill({json: body});
        if (p === '/api/business/access') return json({account:{id:uid,userId:7,companyName:'Blue Wing Creative',status:'approved'},keyConfigured:true,encryptionReady:true,adultVerified:true});
        if (p === '/api/business/credentials') return json({credential:{id:uid,label:'Test',last4:'test',updatedAt:'2026-11-05T00:00:00Z'}});
        if (p === '/api/business/models') return json(catalog);
        if (p === '/api/business/price-preview') {
          quotes++;
          const body = route.request().postDataJSON();
          assert.equal(body.model, 'gpt-image-2');
          assert(!('prompt' in body) && !('references' in body) && !('apiKey' in body));
          await new Promise(resolve => setTimeout(resolve, 350));
          if (quotes === 2) return json({preview:{currency:'USD',reason:'unavailable',rates:[]}});
          return json({preview:{currency:'USD',reason:'usage',rates:[{unit:'imageOutput',low:'30.0000000000',high:'30.0000000000'}]}});
        }
        if (p === '/api/business/generations') {
          if (route.request().method() === 'POST') {
            posts++;
            const body=route.request().postDataJSON();
            assert.equal(body.parameters.model,'gpt-image-2');
            assert.equal(route.request().headers().prefer,'respond-async');
            const first = posts === 1;
            const job = fixture(first?'4':'5','image','submitting',{createdAt:new Date().toISOString(),prompt:body.parameters.prompt,clientRequestId:body.clientRequestId});
            jobs = [job,...jobs];
            if (!first) return route.abort('failed');
            await new Promise(resolve => { releaseAcceptance = resolve; signalAcceptance(); });
            return route.fulfill({ status:202, json:{generation:job} });
          }
          if (url.searchParams.has('clientRequestId')) {
            exactReads++;
            showSecond = true;
            return json({generation:jobs.find(job=>job.clientRequestId===url.searchParams.get('clientRequestId')) ?? null});
          }
          return json({generations:jobs.filter(job=>job.id!=='5'||showSecond)});
        }
        if (p === '/api/business/generations/4') {
          polls++;
          jobs = jobs.map(job=>job.id==='4'?{...job,status:'completed',images:[{url:'/home-films/sound.jpg'}]}:job);
          return json({generation:jobs.find(job=>job.id==='4')});
        }
        if (p === '/api/business/generations/5') {
          jobs = jobs.map(job=>job.id==='5'?{...job,status:'failed',errorCode:'provider_rejected'}:job);
          return json({generation:jobs.find(job=>job.id==='5')});
        }
        if (/^\/api\/business\/generations\/[^/]+\/reuse$/.test(p)) {
          const job = jobs.find(item=>item.id===p.split('/').at(-2));
          return json({reuse:{parameters:{prompt:job.prompt},references:[],missingReferences:0}});
        }
        if (p === '/api/assets') return json({assets:[],configured:true});
        if (p === '/api/auth/me') return json({user:{id:7,name:'Test user',role:'user',credits:10}});
        return json({});
      });
      await page.goto(`${base}/business?kind=image&model=gpt-image-2`);
      const textarea=page.locator('textarea').first(); await textarea.waitFor({timeout:120000});
      const stage=page.getByRole('region',{name:c.results,exact:true});
      await stage.getByRole('button',{name:`${c.result} 2`,exact:true}).click();
      assert.equal(await stage.getByRole('button',{name:`${c.result} 2`,exact:true}).getAttribute('aria-pressed'),'true');
      await stage.getByRole('button',{name:c.expand,exact:true}).last().click();
      const dialog=page.getByRole('dialog'); await dialog.waitFor();
      await dialog.getByRole('button',{name:c.previous,exact:true}).click();
      assert.equal(await dialog.locator('img').first().getAttribute('src'),'/home-films/worlds.jpg');
      await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});
      await stage.getByRole('button',{name:c.copy,exact:true}).click();
      assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'Campaign 3');
      await stage.getByRole('button',{name:c.reuse}).click();
      await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Campaign 3');
      assert.equal(await textarea.inputValue(),'Campaign 3'); assert.equal(posts,0,'Preview, copy and reuse must not generate');
      for (const width of [320, 1600]) {
        await page.setViewportSize({width,height: width === 320 ? 680 : 1100});
        await page.getByRole('button',{name:t.generate,exact:false}).click();
        const quote = dialog.getByRole('region',{name:priceCopy.title,exact:true});
        await quote.getByText(priceCopy.loading, {exact:true}).waitFor();
        assert.equal(await dialog.getByRole('button',{name:t.confirm,exact:true}).isEnabled(),false);
        await quote.getByText(width === 320 ? priceCopy.usage : priceCopy.unavailable,{exact:true}).waitFor();
        assert.equal(await dialog.getByRole('button',{name:t.confirm,exact:true}).isEnabled(),true);
        assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth),true);
        await dialog.getByRole('button',{name:t.cancel,exact:true}).click();
        assert.equal(posts,0,'Opening and cancelling the cost preview must not generate');
      }
      assert.equal(quotes,2);
      console.log(`PASS ${locale}: cost preview blocks early submission, has no overflow at 320px, and cancels without a generation POST`);
      if (process.env.PRICE_PREVIEW_ONLY) { await context.close(); continue; }
      await textarea.fill('A quiet campaign scene');
      await textarea.locator('xpath=ancestor::form').locator('button[type=submit]').click();
      await dialog.waitFor(); await dialog.getByRole('button').first().click();
      await dialog.waitFor({state:'detached'});
      await acceptanceStarted;
      await page.getByText(c.registering,{exact:true}).waitFor();
      assert.equal(await textarea.inputValue(),'A quiet campaign scene');
      await textarea.fill('Next draft while the request registers');
      assert.equal(await textarea.inputValue(),'Next draft while the request registers');
      await page.getByRole('button',{name:work,exact:true}).click();
      await page.waitForURL('**tab=history');
      releaseAcceptance();
      await page.locator('img[src="/home-films/sound.jpg"]').first().waitFor({timeout:25000});
      assert.equal(posts,1); assert.ok(polls>0,'Pending generation must reconcile automatically');
      if (process.env.TEST_SCREENSHOTS) { fs.mkdirSync(process.env.TEST_SCREENSHOTS,{recursive:true}); await page.screenshot({path:path.join(process.env.TEST_SCREENSHOTS,`results-${locale}.png`),fullPage:true}); }
      await page.getByRole('searchbox',{name:c.search}).fill('Campaign 3');
      const cards=page.locator('button[aria-label^="'+c.result+' ·"]'); assert.equal(await cards.count(),1);
      await cards.first().click(); await dialog.waitFor();
      await dialog.getByRole('button',{name:`${c.result} 2`,exact:true}).click();
      await dialog.getByRole('button',{name:c.reuse}).click();
      await page.waitForURL(url=>!url.searchParams.has('tab'));
      assert.equal(await textarea.inputValue(),'Campaign 3'); assert.equal(posts,1);
      await stage.getByRole('button',{name:new RegExp(s.viewHistory)}).click(); await page.waitForURL('**tab=history');
      await page.getByRole('combobox',{name:new RegExp(c.type)}).selectOption('video'); assert.equal(await cards.count(),1);
      await cards.first().click(); await dialog.waitFor(); assert.equal(await dialog.locator('video').count(),1);
      await page.keyboard.press('Escape');
      await page.getByRole('combobox',{name:new RegExp(c.type)}).selectOption('all');
      await page.getByRole('combobox',{name:new RegExp(c.status)}).selectOption('failed'); assert.equal(await cards.count(),1);
      await page.getByRole('combobox',{name:new RegExp(c.status)}).selectOption('all');
      if (process.env.TEST_SCREENSHOTS) await page.screenshot({path:path.join(process.env.TEST_SCREENSHOTS,`collection-${locale}.png`),fullPage:true});
      await page.setViewportSize({width:390,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
      await cards.first().click(); await dialog.waitFor();
      assert.equal(await dialog.evaluate(node=>node.getBoundingClientRect().width <= innerWidth),true);
      if(process.env.TEST_SCREENSHOTS) await page.screenshot({path:path.join(process.env.TEST_SCREENSHOTS,`viewer-mobile-${locale}.png`),fullPage:true});
      await page.keyboard.press('Escape');
      await page.goto(`${base}/business?kind=image&model=gpt-image-2`);
      await textarea.fill('Recover an unacknowledged submission');
      const submit = textarea.locator('xpath=ancestor::form').locator('button[type=submit]');
      await submit.click();
      await dialog.waitFor();
      await dialog.getByRole('button',{name:t.confirm,exact:true}).click();
      await page.getByRole('status').filter({hasText:t.uncertain}).waitFor();
      assert.equal(await submit.isDisabled(),true);
      await page.reload();
      await page.getByText(businessError(t,'provider_rejected'),{exact:true}).first().waitFor({timeout:25000});
      assert.equal(posts,2,'Finding the original job must not send another paid request');
      assert.ok(exactReads>0,'Reload must recover the original request even if it was absent from the initial history');
      await textarea.fill('A distinct draft after failure');
      assert.equal(await submit.isEnabled(),true);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${locale}: gallery, editor/navigation during acknowledgement, background completion, original receipt recovery after reload, failed-job release, and mobile`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
