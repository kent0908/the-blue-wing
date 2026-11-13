import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, canEncodeVideo } from "mediabunny";
import { WAN3_MAX_REFERENCE_SECONDS } from "./businessWan3";

export async function wanGifToMp4(file: File): Promise<File> {
  // ImageDecoder composites disposal and transparency across the entire animation.
  const Decoder = (globalThis as typeof globalThis & { ImageDecoder?: new (init: ImageDecoderInit) => ImageDecoder }).ImageDecoder;
  if (!Decoder) throw new Error("wan_gif_unsupported");
  const decoder = new Decoder({ data: file.stream(), type: "image/gif", preferAnimation: true });
  try {
    await decoder.tracks.ready;
    await decoder.completed;
    const track = decoder.tracks.selectedTrack;
    if (!track || track.frameCount < 2 || track.frameCount > 450) throw new Error("wan_video_invalid");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("wan_gif_unsupported");
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const source = new CanvasSource(canvas, { codec: "avc", bitrate: 2_000_000 });
    const fps = 30;
    let timeline = 0;
    let frameIndex = 0;
    let started = false;
    try {
      for (let index = 0; index < track.frameCount; index++) {
        const { image } = await decoder.decode({ frameIndex: index });
        try {
          if (!started) {
            const width = image.displayWidth, height = image.displayHeight;
            if (width * height > 4_000_000 || Math.max(width, height) / Math.min(width, height) > 8)
              throw new Error("wan_video_invalid");
            const scale = Math.max(240 / Math.min(width, height), Math.min(1, 1280 / Math.max(width, height)));
            canvas.width = Math.ceil(width * scale / 2) * 2;
            canvas.height = Math.ceil(height * scale / 2) * 2;
            if (!await canEncodeVideo("avc", { width: canvas.width, height: canvas.height, bitrate: 2_000_000 }))
              throw new Error("wan_gif_unsupported");
            output.addVideoTrack(source, { frameRate: fps });
            await output.start();
            started = true;
          }
          const frameDuration = (image.duration || 100_000) / 1_000_000;
          timeline += frameDuration;
          if (timeline > WAN3_MAX_REFERENCE_SECONDS + 1e-6) throw new Error("wan_video_invalid");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          // Sample the GIF timeline at 30 fps. Long holds get repeated frames
          // so the resulting video meets Wan's minimum frame rate.
          const targetIndex = Math.round(timeline * fps);
          while (frameIndex < targetIndex) {
            await source.add(frameIndex / fps, 1 / fps);
            frameIndex++;
          }
        } finally {
          image.close();
        }
      }
      // Hold the final frame when one GIF cycle is shorter than Wan's minimum.
      while (frameIndex < fps) {
        await source.add(frameIndex / fps, 1 / fps);
        frameIndex++;
      }
      await output.finalize();
      if (!target.buffer) throw new Error("wan_video_invalid");
      return new File([target.buffer], file.name.slice(0, 115).replace(/\.gif$/i, "") + ".mp4", { type: "video/mp4" });
    } catch (error) {
      if (started && output.state !== "finalized") await output.cancel().catch(() => {});
      throw error;
    }
  } finally {
    decoder.close();
  }
}
