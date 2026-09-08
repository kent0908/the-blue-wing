const fs=require('fs');const base=fs.readFileSync('scripts/test-generation-access.cjs','utf8');let head=base.slice(0,base.indexOf('(async () =>'));head+=`
let payload;
mocks['@/lib/siraya'].createVideo=async b=>{payload=b;counts.provider++;return {id:'mock-job'}};
mocks['@/lib/generationAssetUrls']={createGenerationAssetUrls:async(u,ids)=>ids.map(id=>'https://trusted.invalid/'+id)};
mocks['@/lib/providerAssets']={resolveProviderAssetReferences:async(u,ids)=>{assert.equal(u,7);return ids.map(id=>({type:'image',url:'asset://owned-'+id,role:'reference_image'}))}};
(async()=>{
 const route=load('app/api/videos/route.ts');
 await test('first-last maps only frame_images and adaptive for 2.5',async()=>{const r=await route.POST(request('videos','SIRAYA-Seedance-2.5',{generationMode:'first-last-frame',assetIds:[1,2],seconds:4,resolution:'720p'}));assert.equal(r.status,200);assert.equal(payload.frame_images.length,2);assert.equal(payload.frame_images[0].frame_type,'first_frame');assert.equal(payload.aspect_ratio,'adaptive');assert.equal(payload.input_references,undefined);assert.equal(payload.generationMode,undefined)});
 await test('active owned Asset IDs resolve server-side',async()=>{const r=await route.POST(request('videos','SIRAYA-Seedance-2.0-mini',{generationMode:'subject-reference',providerAssetIds:[1],seconds:4,resolution:'720p'}));assert.equal(r.status,200);assert.equal(payload.input_references[0].url,'asset://owned-1');assert.equal(payload.input_references[0].role,'reference_image');assert.equal(payload.providerAssetIds,undefined)});
 await test('raw asset URI cannot bypass ownership',async()=>{const r=await route.POST(request('videos','SIRAYA-Seedance-2.0-mini',{generationMode:'subject-reference',imageUrls:['asset://foreign'],seconds:4}));assert.equal(r.status,400);assert.equal(counts.paid,0)});
 await test('disabled edit mode fails before billing',async()=>{const r=await route.POST(request('videos','SIRAYA-Seedance-2.0-mini',{generationMode:'video-edit',seconds:4}));assert.equal(r.status,400);assert.equal(counts.paid,0)});
 await test('one frame cannot trigger two-frame generation',async()=>{const r=await route.POST(request('videos','SIRAYA-Seedance-2.5',{generationMode:'first-last-frame',assetIds:[1],seconds:4}));assert.equal(r.status,400);assert.equal(counts.paid,0)});
 console.log('PASS '+checks.length+' mode route contracts; mocked external effects only');
})().catch(e=>{console.error(e);process.exitCode=1});
`;fs.writeFileSync('scripts/test-mode-route-contract.cjs',head);
