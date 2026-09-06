import { SirayaApiError } from "./siraya";
import { videoConstraintFor } from "./videoModels";
import { sizeOptionsFor } from "./imageModels";
const bad=()=>{throw new SirayaApiError(400,"生成參數不正確或包含未支援的欄位");};
export function validateGeneration(body:Record<string,unknown>,kind:"image"|"video"|"text"|"imageEdit") {
  const common=["model","prompt"];
  const keys=kind==="image"?["n","size","quality","style","response_format","negative_prompt","seed","background","output_compression","moderation","watermark","assetIds","image"]:
    kind==="video"?["seconds","resolution","aspect_ratio","generate_audio","negative_prompt","seed","extra_body","assetIds","imageUrls","videoUrl","async"]:
    kind==="imageEdit"?["image","mask"]:
    ["messages","stream","temperature","max_tokens"];
  if(!body || typeof body!=="object" || Object.keys(body).some(k=>![...common,...keys].includes(k)))bad();
  if(typeof body.model!=="string"||!/^[a-zA-Z0-9._:-]{1,150}$/.test(body.model))bad();
  if(kind!=="text" && (typeof body.prompt!=="string"||!body.prompt.trim()||body.prompt.length>12000))bad();
  if(kind==="imageEdit"){
    if(typeof body.image!=="string"||!body.image.trim())bad();
    if(body.mask!==undefined && (typeof body.mask!=="string"||!body.mask.trim()))bad();
  }
  const integer=(key:string,def:number,min:number,max:number)=>{
    const value=body[key]??def;
    if(typeof value!=="number"||!Number.isSafeInteger(value)||value<min||value>max)bad();
    body[key]=value;
  };
  if(kind==="image") {
    integer("n",1,1,10);
    // Per-model, not a flat shared list — same reasoning as the video
    // resolution/duration fix (lib/videoModels.ts's videoConstraintFor):
    // Seedream 4.5 / Dola 5.0 need a ≥3,686,400px size, GPT Image 2's real
    // sizes aren't the same set as Seedream's — see lib/imageModels.ts's
    // sizeOptionsFor for exactly which model needs which.
    if(body.size!==undefined && (typeof body.size!=="string"|| !sizeOptionsFor(typeof body.model==="string"?body.model:null).includes(body.size)))bad();
  }
  if(kind==="video"){
    // Real per-model ceilings (lib/videoModels.ts's videoConstraintFor,
    // verified live against SIRAYA 2026-09-06) — not every Seedance version
    // accepts the same resolutions or the same max duration (2.0-mini tops
    // out at 720p/15s, only 2.5 reaches 1080p+30s, base 2.0 alone has a
    // real 4k tier), so this is the same defense-in-depth backstop as
    // lib/jobsStore.tsx's client-side clamp, for anyone calling the API
    // directly.
    const constraint=videoConstraintFor(typeof body.model==="string"?body.model:null);
    integer("seconds",5,1,constraint.maxSeconds);
    body.resolution??="480p";
    if(!constraint.resolutions.includes(String(body.resolution)))bad();
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
