const {spawnSync}=require('node:child_process');
if(!process.argv[2]){for(const mode of ['buffer','stream']){const p=spawnSync(process.execPath,[__filename,mode],{encoding:'utf8'});process.stdout.write(p.stdout);if(p.status)process.exit(p.status);}return;}
const mode=process.argv[2], jobs=8, bytes=32*1024*1024;
const start=performance.now();let peak=0;
const sample=()=>peak=Math.max(peak,process.memoryUsage().arrayBuffers);
async function transfer(){let sent=0;const stream=new ReadableStream({pull(c){if(sent>=bytes)c.close();else{sent+=65536;c.enqueue(new Uint8Array(65536));}}});
if(mode==='buffer'){const b=await new Response(stream).arrayBuffer();sample();await new Promise(r=>setTimeout(r,5));if(b.byteLength!==bytes)throw Error('size');}else{const reader=stream.getReader();let n=0;for(;;){const x=await reader.read();if(x.done)break;n+=x.value.length;sample();await new Promise(r=>setImmediate(r));}if(n!==bytes)throw Error('size');}}
Promise.all(Array.from({length:jobs},transfer)).then(()=>console.log(JSON.stringify({mode,jobs,totalMiB:jobs*bytes/1048576,peakArrayBuffersMiB:+(peak/1048576).toFixed(1),elapsedMs:Math.round(performance.now()-start),scope:'synthetic transfer only; not Vercel/Blob or site capacity'})));
