import { googleSpeechError } from "./googleSpeechError";
import type { CompanionLanguage } from "./companionVoices";
import { monitoredModelFetch } from "./modelMonitoring";
import { resolveVoice } from "./voices";
import { pcmFromCloudWav } from "./speechWav";

/** 3.8 uses structured delivery directions and returns a WAV, unlike older raw-PCM models. */
export async function synthesizeGemini38Pcm(input: {text:string;voiceName?:string|null;style?:string|null;language?:CompanionLanguage}, authHeaders: Record<string,string>, model="gemini-3.8-flash-tts") {
  if (!input.text.trim() || Buffer.byteLength(input.text,"utf8")>4000) throw new Error("語音文字須為 1–4000 UTF-8 bytes");
  if (!["gemini-3.8-flash-tts","gemini-3.8-flash-lite-tts"].includes(model)) throw new Error("不支援的語音模型");
  const response=await monitoredModelFetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
    method:"POST",headers:{...authHeaders,"Content-Type":"application/json"},signal:AbortSignal.timeout(45000),
    body:JSON.stringify({model,store:false,
      input:[{type:"user_input",content:[{type:"text",text:input.text,annotations:[{type:"speech_metadata",style:input.style?.trim().slice(0,200)||"自然溫暖的台灣華語，語速適中，像日常對話。"}]}]}],
      response_format:{type:"audio",mime_type:"audio/wav",sample_rate:24000},
      generation_config:{speech_config:[{voice:resolveVoice(input.voiceName)}]},
    }),
  },{model,provider:"google"});
  if (!response.ok) {
    const failure=await response.json().catch(()=>null);
    throw googleSpeechError(response.status, failure, authHeaders);
  }
  const body=await response.json() as {status?:string;model?:string;steps?:{type?:string;content?:{type?:string;mime_type?:string;data?:string}[]}[];usage?:{total_input_tokens?:number;total_output_tokens?:number;total_tokens?:number}};
  if (body.status!=="completed") throw new Error("Gemini 3.8 語音尚未完成");
  if (body.model && body.model!==model) throw new Error("語音回傳模型與要求不符");
  const audio=body.steps?.filter(s=>s.type==="model_output").flatMap(s=>s.content??[]).filter(c=>c.type==="audio").at(-1);
  if (!audio?.data || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio.data) || (audio.mime_type && audio.mime_type!=="audio/wav")) throw new Error("Gemini 3.8 未回傳 WAV 音訊");
  const pcm=pcmFromCloudWav(Buffer.from(audio.data,"base64"));
  const count=(n:unknown)=>typeof n==="number"&&Number.isFinite(n)&&n>=0?n:undefined;
  return {pcm,seconds:pcm.length/48000,usage:{prompt_tokens:count(body.usage?.total_input_tokens),completion_tokens:count(body.usage?.total_output_tokens),total_tokens:count(body.usage?.total_tokens)}};
}
