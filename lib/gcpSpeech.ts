import { gcpAccessToken } from "./gcpAuth";
import { monitoredModelFetch } from "./modelMonitoring";
import { resolveVoice } from "./voices";

export const GCP_SPEECH_MODEL = "gemini-2.5-flash-tts";
/** Validate Cloud TTS LINEAR16 WAV and extract PCM before wrapping for the shared adapter. */
export function pcmFromCloudWav(wav: Buffer): Buffer {
  if (wav.length < 44 || wav.toString("ascii",0,4) !== "RIFF" || wav.toString("ascii",8,12) !== "WAVE" || wav.readUInt32LE(4)+8 !== wav.length) throw new Error("Google Cloud 音訊不是完整 WAV");
  let validFormat = false;
  let pcm: Buffer | undefined;
  for (let offset=12; offset+8<=wav.length;) {
    const kind=wav.toString("ascii",offset,offset+4), size=wav.readUInt32LE(offset+4), start=offset+8;
    if (start+size>wav.length) throw new Error("Google Cloud 音訊區塊不完整");
    if (kind === "fmt ") {
      validFormat = size>=16 && wav.readUInt16LE(start)===1 && wav.readUInt16LE(start+2)===1 && wav.readUInt32LE(start+4)===24000 && wav.readUInt16LE(start+12)===2 && wav.readUInt16LE(start+14)===16;
    }
    if (kind === "data") pcm=wav.subarray(start,start+size);
    offset=start+size+(size%2);
  }
  if (!validFormat || !pcm?.length || pcm.length%2) throw new Error("Google Cloud 音訊格式不支援");
  return pcm;
}
export async function synthesizeGcpPcm(input: {text:string;voiceName?:string|null;style?:string|null}) {
  if (!input.text.trim() || Buffer.byteLength(input.text, "utf8") > 4000) throw new Error("語音文字須為 1–4000 UTF-8 bytes");
  const token = await gcpAccessToken();
  const response = await monitoredModelFetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-goog-user-project": process.env.GCP_PROJECT_ID! },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      input: { text: input.text, prompt: input.style?.trim().slice(0,200) || "以自然溫暖的台灣華語說話，語速適中，只朗讀提供的文字。" },
      voice: { languageCode: "cmn-TW", name: resolveVoice(input.voiceName), modelName: GCP_SPEECH_MODEL },
      audioConfig: {audioEncoding: "LINEAR16", sampleRateHertz: 24000},
    }),
  }, {model:GCP_SPEECH_MODEL,provider:"google-cloud"});
  if (!response.ok) throw new Error(`Google Cloud 語音生成失敗（HTTP ${response.status}）`);
  const body = await response.json() as {audioContent?:string};
  const encoded = body.audioContent;
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("Google Cloud 未回傳有效音訊");
  const pcm = pcmFromCloudWav(Buffer.from(encoded,"base64"));
  if (!pcm.length || pcm.length%2) throw new Error("Google Cloud 音訊格式不完整");
  // Cloud TTS doesn't return token usage here. Do not invent receipt tokens.
  return {pcm, seconds:pcm.length/48000};
}
