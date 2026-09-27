/** Validate Cloud TTS LINEAR16 WAV and extract PCM before wrapping for the shared adapter. */
export function pcmFromCloudWav(wav: Buffer): Buffer {
  if (wav.length < 44 || wav.toString("ascii",0,4) !== "RIFF" || wav.toString("ascii",8,12) !== "WAVE" || wav.readUInt32LE(4)+8 !== wav.length) throw new Error("語音服務 音訊不是完整 WAV");
  let validFormat = false;
  let pcm: Buffer | undefined;
  for (let offset=12; offset+8<=wav.length;) {
    const kind=wav.toString("ascii",offset,offset+4), size=wav.readUInt32LE(offset+4), start=offset+8;
    if (start+size>wav.length) throw new Error("語音服務 音訊區塊不完整");
    if (kind === "fmt ") {
      validFormat = size>=16 && wav.readUInt16LE(start)===1 && wav.readUInt16LE(start+2)===1 && wav.readUInt32LE(start+4)===24000 && wav.readUInt16LE(start+12)===2 && wav.readUInt16LE(start+14)===16;
    }
    if (kind === "data") pcm=wav.subarray(start,start+size);
    offset=start+size+(size%2);
  }
  if (!validFormat || !pcm?.length || pcm.length%2) throw new Error("語音服務 音訊格式不支援");
  return pcm;
}
