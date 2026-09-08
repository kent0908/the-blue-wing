import { validateLayerRequest } from "./layerDecomposition";
﻿import { assertPromptSafety } from "./promptSafety";
import { SirayaApiError } from "./siraya";
import { videoResolutionsForModel, normalizeVideoResolution } from "./videoModels";
const bad=()=>{throw new SirayaApiError(400,"生成參數不正確或包含未支援的欄位");};
export function validateGeneration(body:Record<string,unknown>,kind:"image"|"video"|"text"|"imageEdit") {
  const common=["model","prompt"];
  const keys=kind==="image"?["n","size","quality","style","response_format","negative_prompt","seed","background","output_compression","moderation","watermark","assetIds","image","layer_decomposition","output_format","confirmedMaxCredits"]:
    kind==="video"?["seconds","resolution","aspect_ratio","generate_audio","negative_prompt","seed","extra_body","assetIds","imageUrls","videoUrl","async","generationMode","providerAssetIds"]:
    kind==="imageEdit"?["image","mask"]:
    ["messages","stream","temperature","max_tokens"];
  if(!body || typeof body!=="object" || Object.keys(body).some(k=>![...common,...keys].includes(k)))bad();
  if(typeof body.model!=="string"||!/^[a-zA-Z0-9._:-]{1,150}$/.test(body.model))bad();
  if(kind==="image"&&body.layer_decomposition===true&&body.prompt===undefined)body.prompt="";
  if(kind!=="text" && (typeof body.prompt!=="string"||(!body.prompt.trim()&&body.layer_decomposition!==true)||body.prompt.length>12000))bad();
  if(kind!=="text") assertPromptSafety(body.prompt, body.negative_prompt, body.style, body.background);
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
    if(body.layer_decomposition!==undefined&&typeof body.layer_decomposition!=="boolean")bad();
    validateLayerRequest(body);
    if(body.layer_decomposition!==true&&body.size!==undefined && (typeof body.size!=="string"|| !/^(1024x1024|1792x1024|1024x1792|2048x2048|2560x1440|1440x2560|2304x1728)$/.test(body.size)))bad();
  }
  if(kind==="video"){
    if(body.generationMode!==undefined && (typeof body.generationMode!=="string" || body.generationMode.length>40))bad();
    if(body.providerAssetIds!==undefined && (!Array.isArray(body.providerAssetIds)||body.providerAssetIds.length>50||body.providerAssetIds.some((id:unknown)=>typeof id!=="number"||!Number.isSafeInteger(id)||id<1)))bad();
    integer("seconds",5,1,30);
    const resolutions = videoResolutionsForModel(String(body.model));
    if (!resolutions.length) throw new SirayaApiError(400, "此影片模型的解析度尚未完成設定，請選擇其他模型。");
    body.resolution ??= normalizeVideoResolution(String(body.model), "480p");
    if (typeof body.resolution !== "string" || !resolutions.some(r => r === body.resolution)) {
      throw new SirayaApiError(400, `此模型僅支援 ${resolutions.join("、")}，請重新選擇解析度。`);
    }
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

