import type { ResultItem } from "./types";

/**
 * Trigger a save-as download for a result.
 *  - data: URLs (b64 image output) download directly — no CORS involved.
 *  - `/api/media/...` (lib/mediaStore.ts's own proxy for re-hosted
 *    generations, same-origin) also downloads directly — the `download`
 *    attribute works natively for same-origin hrefs.
 *  - Anything else (a leftover pre-persistence row still pointing at the
 *    original, possibly-expiring provider URL) goes through /api/download:
 *    those are cross-origin and mostly don't send CORS headers, so a plain
 *    <a download> either gets ignored (navigates instead of saving) or a
 *    client fetch()-to-Blob silently fails — the proxy (same-origin, sets
 *    Content-Disposition: attachment) makes the save dialog reliable.
 */
export function downloadResult(item: Pick<ResultItem, "id" | "kind" | "url">) {
  if (!item.url) return;
  const extFromUrl = item.url.match(/\.(png|jpe?g|webp|gif|mp4|webm|mov)(?:[?#]|$)/i)?.[1]?.toLowerCase();
  const ext = extFromUrl || (item.kind === "video" ? "mp4" : "png");
  const filename = `blue-wing-${item.kind}-${item.id}.${ext}`;
  const sameOrigin = item.url.startsWith("data:") || item.url.startsWith("/");

  const a = document.createElement("a");
  a.href = sameOrigin ? item.url : `/api/download?url=${encodeURIComponent(item.url)}&name=${encodeURIComponent(filename)}`;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
