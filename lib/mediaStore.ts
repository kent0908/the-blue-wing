/**
 * Generated images/videos come back from SIRAYA either as an inline base64
 * data URL, or as a signed URL pointing at the upstream provider's own
 * storage (Volces TOS for Seedance/Seedream) — those signed URLs expire
 * (observed: `X-Tos-Expires=86400`, i.e. 24h). Recording that URL directly
 * into `generations.url` meant every result silently turned into a broken
 * image/video once its signed URL expired — permanently, since there's no
 * way to re-fetch an already-expired link. This re-hosts the bytes to our
 * own Vercel Blob storage right after generation so 生成紀錄 stays valid
 * indefinitely, the same way user-uploaded assets already do.
 *
 * Public (not private+proxied like assets/[id]/raw) — these are read via a
 * plain <img>/<video> src in the history grid and the main viewer, and the
 * blob pathname includes a random suffix, so it's unguessable-by-obscurity
 * the same way the upstream signed URLs already were. Never throws — a
 * persistence failure just falls back to the original (possibly-expiring)
 * URL rather than losing the result.
 */
import { put } from "@vercel/blob";
import { blobConfigured } from "./assets";

const DATA_URL_RE = /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,([\s\S]+)$/;

export async function persistGeneratedMedia(
  sourceUrl: string,
  opts: { userId: number; kind: "image" | "video"; debugRethrow?: boolean }
): Promise<string> {
  if (!blobConfigured()) {
    if (opts.debugRethrow) throw new Error("blobConfigured() returned false");
    return sourceUrl;
  }

  try {
    let buf: Buffer;
    let contentType: string;

    const dataMatch = sourceUrl.match(DATA_URL_RE);
    if (dataMatch) {
      contentType = dataMatch[1];
      buf = Buffer.from(dataMatch[2], "base64");
    } else {
      const res = await fetch(sourceUrl);
      if (!res.ok) return sourceUrl;
      contentType = res.headers.get("content-type") || (opts.kind === "video" ? "video/mp4" : "image/png");
      buf = Buffer.from(await res.arrayBuffer());
    }

    const ext = contentType.split("/")[1]?.split(";")[0] || (opts.kind === "video" ? "mp4" : "png");
    const blob = await put(`generations/${opts.userId}/${opts.kind}-${Date.now()}.${ext}`, buf, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    return blob.url;
  } catch (err) {
    console.error("persistGeneratedMedia failed, keeping original URL:", err);
    if (opts.debugRethrow) throw err;
    return sourceUrl;
  }
}
