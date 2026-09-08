import { SirayaApiError } from './siraya';
export const MAX_LAYER_OUTPUTS = 17;
export interface DecomposedLayer { url:string; z_index:number; bounding_box?:{absolute:number[];normalized:number[]}; name?:string; description?:string; size:string; output_format:string }
const invalid=(message:string):never=>{throw new SirayaApiError(400,message);};
export function validateLayerRequest(body:Record<string,unknown>) {
 if(body.layer_decomposition!==true)return;
 if(!/seedream[-.]5[.-]0[-.]pro/i.test(String(body.model)))invalid('圖層分離僅支援 Seedream 5.0 Pro');
 const references=(Array.isArray(body.assetIds)?body.assetIds.length:0)+(typeof body.image==='string'?1:Array.isArray(body.image)?body.image.length:0);
 if(references!==1)invalid('圖層分離需提供且僅能提供一張原圖');
 if(body.n!==undefined&&body.n!==1)invalid('圖層分離一次只接受一張原圖');
 if(body.size!==undefined&&!['auto','1K','1.5K','2K'].includes(String(body.size)))invalid('圖層分離尺寸僅支援 auto、1K、1.5K、2K');
 if(body.output_format!==undefined&&body.output_format!=='png')invalid('圖層分離輸出格式必須為 PNG');
}
/** Validate actual bytes before sending material to the provider. URLs must be imported into the owned asset library first. */
export function validateLayerInput(image:string) {
 const m=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(image);
 if(!m)invalid('請先將 PNG 或 JPEG 原圖加入素材庫後再分離圖層');
 const data=Buffer.from(m![2],'base64');
 if(data.length>30*1024*1024)invalid('圖層分離原圖不得超過 30 MB');
 let width=0,height=0;
 if(data.length>=24&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {width=data.readUInt32BE(16);height=data.readUInt32BE(20);}
 else if(data[0]===255&&data[1]===216){
  let p=2;
  while(p+4<=data.length){
   if(data[p++]!==255)break;
   while(data[p]===255)p++;
   const marker=data[p++];if(marker===217||marker===218)break;
   if(marker===1||(marker>=208&&marker<=215))continue;
   if(p+2>data.length)break;
   const len=data.readUInt16BE(p);if(len<2||p+len>data.length)break;
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&len>=7){height=data.readUInt16BE(p+3);width=data.readUInt16BE(p+5);break;}p+=len;
  }
 }
 if(!width||!height||width*height<262144||width*height>36000000||width/height<1/16||width/height>16)invalid('原圖需為有效 PNG/JPEG，262,144～36,000,000 像素，長寬比介於 1:16 與 16:1');
 return {width,height};
}
/** Structural diagnostics only: never log URLs, base64, prompts, names or descriptions. */
export function layerResponseShape(data:unknown) {
 return {kind:Array.isArray(data)?'array':typeof data,count:Array.isArray(data)?data.length:null,items:Array.isArray(data)?data.slice(0,17).map(d=>{
  if(!d||typeof d!=='object')return {kind:typeof d};
  const r=d as Record<string,unknown>;
  return {fields:Object.keys(r).sort(),zIndexType:typeof r.z_index,zIndex:typeof r.z_index==='number'?r.z_index:null,sizeType:typeof r.size,size:typeof r.size==='string'&&/^\d+x\d+$/.test(r.size)?r.size:null,format:typeof r.output_format==='string'&&['png','jpeg','webp'].includes(r.output_format)?r.output_format:null,boxType:Array.isArray(r.bounding_box)?'array':typeof r.bounding_box,boxFields:r.bounding_box&&typeof r.bounding_box==='object'?Object.keys(r.bounding_box).sort():[]};
 }):[]};
}
export function parseLayerResponse(data:unknown):DecomposedLayer[] {
 try {
 if(!Array.isArray(data)||data.length<2||data.length>MAX_LAYER_OUTPUTS)throw new SirayaApiError(502,'上游未返回完整圖層分離結果，已取消本次扣點');
 const seen=new Set<number>();
 const layers=data.map((d)=>{
  if(!d||typeof d!=='object'||!Number.isInteger(d.z_index)||d.z_index<0||d.z_index>16||seen.has(d.z_index)||typeof d.size!=='string'||!/^\d+x\d+$/.test(d.size)||(!d.url&&!d.b64_json))throw new SirayaApiError(502,'上游圖層資料不完整，已取消本次扣點');
  if(d.z_index>0){
   const boxes=d.bounding_box;
   if(d.output_format!=='png'||typeof d.name!=='string'||typeof d.description!=='string'||!boxes||![boxes.absolute,boxes.normalized].every(b=>Array.isArray(b)&&b.length===4&&b.every((v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0)&&b[2]>b[0]&&b[3]>b[1])||boxes.normalized.some((v:number)=>v>1000))throw new SirayaApiError(502,'上游缺少圖層位置資訊，已取消本次扣點');
  }else if(!['png','jpeg'].includes(d.output_format))throw new SirayaApiError(502,'上游基底圖片格式不正確');
  seen.add(d.z_index);
  return {url:d.url?String(d.url):`data:image/${d.output_format};base64,${d.b64_json}`,z_index:d.z_index,bounding_box:d.bounding_box,name:d.name,description:d.description,size:d.size,output_format:d.output_format};
 });
 if(!seen.has(0))throw new SirayaApiError(502,'上游缺少基底圖層，已取消本次扣點');
 return layers.sort((a,b)=>a.z_index-b.z_index);
 }catch(error){console.warn('layer_decomposition_response_shape',JSON.stringify(layerResponseShape(data)));throw error;}
}
