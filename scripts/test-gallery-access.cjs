(async()=>{
 const base='https://the-blue-wing.vercel.app';
 for(const slot of ['video-2','companions-3','video-99']){
  const r=await fetch(base+'/api/landing-media/'+slot);console.log(JSON.stringify({slot,status:r.status,expected:slot==='video-99'?400:404}));if(r.status!==(slot==='video-99'?400:404))process.exitCode=1;
 }
 const r=await fetch(base+'/api/admin/landing-media/upload',{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({type:'blob.generate-client-token',payload:{pathname:'validation-only.png',clientPayload:JSON.stringify({slot:'video-2'})}})});
 const j=await r.json();const denied=!r.ok&&JSON.stringify(j).includes('管理員');console.log(JSON.stringify({anonymousUploadDenied:denied,status:r.status}));if(!denied)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1});
