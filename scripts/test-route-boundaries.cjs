const fs = require('node:fs');
const assert = require('node:assert/strict');
const read = p => fs.readFileSync(p, 'utf8');
const home = read('app/page.tsx');
const landing = read('app/landing/page.tsx');
assert.ok(home.includes('<HeroCarousel />') && home.includes('/api/home-blocks'));
assert.ok(!home.includes('<WingExperience') && !home.includes('getLandingMediaMap'));
for (const component of ['WingExperience', 'LandingMedia', 'ClosingGlow']) assert.ok(landing.includes('<' + component));
assert.ok(landing.includes('id:"companions"') && landing.includes('landingGallerySlots(f.id)'));
const sidebar = read('components/Sidebar.tsx');
assert.match(sidebar, /href:\s*"\/",\s*label:\s*"首頁"/);
assert.match(sidebar, /href:\s*"\/landing",\s*label:\s*"啟程"/);
assert.match(read('components/AppFrame.tsx'), /if\(path==="\/landing"\)/);
assert.ok(!read('components/AppFrame.tsx').includes('if(path==="/")'));
assert.match(read('app/explore/page.tsx'), /redirect\("\/"\)/);
for (const route of ['app/api/admin/landing-media/route.ts','app/api/admin/landing-media/upload/route.ts']) {
  assert.ok(read(route).includes('revalidatePath("/landing")'));
}
for (const source of [home,landing]) assert.ok(!/requireUser|requireAdmin|redirect\("\/login/.test(source));
console.log('PASS: home/landing components, navigation, app chrome, explore redirect, media revalidation and public page boundaries. Static regression; browser checks remain separate.');
