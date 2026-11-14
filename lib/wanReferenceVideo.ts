import { BlobSource, Input, MP3, MP4, QTFF, WAVE } from "mediabunny";
import { WAN3_MAX_REFERENCE_SECONDS } from "./businessWan3";

/** Used in the browser and again on the original private Blob before submission. */
export async function inspectWanReferenceVideo(blob: Blob): Promise<number> {
  const input = new Input({ source: new BlobSource(blob), formats: [MP4, QTFF] });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("wan_video_invalid");
    const [width, height, duration, stats] = await Promise.all([
      track.getDisplayWidth(), track.getDisplayHeight(),
      input.computeDuration(undefined, { skipLiveWait: true }),
      track.computePacketStats(120, { skipLiveWait: true }),
    ]);
    if (!Number.isFinite(duration) || duration < 1 || duration > WAN3_MAX_REFERENCE_SECONDS ||
        Math.min(width, height) < 240 || Math.max(width, height) > 4096 ||
        Math.max(width, height) / Math.min(width, height) > 8 || !(stats.averagePacketRate >= 16)) {
      throw new Error("wan_video_invalid");
    }
    return duration;
  } finally {
    input.dispose();
  }
}

export async function inspectWanReferenceAudio(blob: Blob): Promise<number> {
  const input = new Input({ source: new BlobSource(blob), formats: [blob.type === "audio/mpeg" ? MP3 : WAVE] });
  try {
    const track = await input.getPrimaryAudioTrack();
    const duration = await input.computeDuration(undefined, { skipLiveWait: true });
    if (!track || !Number.isFinite(duration) || duration < 1 || duration > WAN3_MAX_REFERENCE_SECONDS)
      throw new Error("wan_audio_invalid");
    return duration;
  } finally {
    input.dispose();
  }
}
