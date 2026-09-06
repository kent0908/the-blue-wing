import { SirayaApiError } from "./siraya";
const bad=()=>{throw new SirayaApiError(400,"生成參數不正確或包含未支援的欄位");};
export function validateGeneration(body:Record<string,unknown>,kind:"image"|"video"|"text") {
  const common=["model","prompt"];
  const keys=kind==="image"?["n","size","quality","style","response_format","negative_prompt","seed","background","output_compression","moderation","watermark","assetIds","image"]:
    kind==="video"?["seconds","resolution","aspect_ratio","generate_audio","negative_prompt","seed","extra_body","assetIds","imageUrls","videoUrl","async"]:
    ["messages","stream","temperature","max_tokens"];
  if(!body || typeof body!=="object" || Object.keys(body).some(k=>![...common,...keys].includes(k)))bad();
  if(typeof body.model!=="string"||!/^[a-zA-Z0-9._:-]{1,150}$/.test(body.model))bad();
  if(kind!=="text" && (typeof body.prompt!=="string"||!body.prompt.trim()||body.prompt.length>12000))bad();
  const integer=(key:string,def:number,min:number,max:number)=>{
    const value=body[key]??def;
    if(typeof value!=="number"||!Number.isSafeInteger(value)||value<min||value>max)bad();
    body[key]=value;
  };
  if(kind==="image") {
    integer("n",1,1,10);
    if(body.size!==undefined && (typeof body.size!=="string"|| !/^(1024x1024|1792x1024|1024x1792|2048x2048|2560x1440|1440x2560|2304x1728)$/.test(body.size)))bad();
  }
  if(kind==="video"){
    integer("seconds",5,1,30);
    body.resolution??="480p";
    if(!["480p","720p","1080p"].includes(String(body.resolution)))bad();
    if(body.extra_body!==undefined){
      const extra=body.extra_body;
      if(!extra||typeof extra!=="object"||Object.keys(extra).some(k=>k!=="watermark")||("watermark" in extra && typeof extra.watermark!=="boolean"))bad();
    }
  }
  if(kind==="text"){
    integer("max_tokens",1024,1,8192);
    if(!Array.isArray(body.messages)||!body.messages.length||body.messages.length>40)bad();
    let chars=0;
    for(const m of body.messages as {role:string;content:string}[]){
      if(!m||!["system","user","assistant"].includes(m.role)||typeof m.content!=="string")bad();
      chars+=m.content.length;
    }
    if(chars>32000)bad();
  }
  for(const k of ["watermark","generate_audio","stream"])if(body[k]!==undefined && typeof body[k]!=="boolean")bad();
  for(const k of ["assetIds","imageUrls"])if(body[k]!==undefined && (!Array.isArray(body[k])||(body[k] as unknown[]).length>50))bad();
}
