import type { ResultItem } from "./types";

/**
 * Trigger a save-as download for a result. Data URLs (b64 image output) can
 * just be downloaded directly — no CORS involved. Remote URLs (Volces TOS for
 * video, various CDNs for images) mostly don't send CORS headers, so a plain
 * <a download> either gets ignored (cross-origin navigates instead of saving)
 * or a client fetch()-to-Blob silently fails; routing through our own
 * /api/download proxy (same-origin, sets Content-Disposition: attachment)
 * makes the save dialog reliable either way.
 */
export function downloadResult(item: Pick<ResultItem, "id" | "kind" | "url">) {
  if (!item.url) return;
  const extFromUrl = item.url.match(/\.(png|jpe?g|webp|gif|mp4|webm|mov)(?:[?#]|$)/i)?.[1]?.toLowerCase();
  const ext = extFromUrl || (item.kind === "video" ? "mp4" : "png");
  const filename = `blue-wing-${item.kind}-${item.id}.${ext}`;

  const a = document.createElement("a");
  a.href = item.url.startsWith("data:")
    ? item.url
    : `/api/download?url=${encodeURIComponent(item.url)}&name=${encodeURIComponent(filename)}`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
