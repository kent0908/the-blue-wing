import "server-only";
import { BusinessError } from "./businessTypes";

export function businessPreviewRange(header: string | null): string | undefined {
  if (header === null) return undefined;
  const match = /^bytes=(\d{0,12})-(\d{0,12})$/.exec(header);
  if (!match || (!match[1] && Number(match[2]) <= 0) ||
      (match[1] && match[2] && Number(match[1]) > Number(match[2]))) {
    throw new BusinessError("invalid_range", 416);
  }
  return header;
}

interface PreviewMedia {
  type: "image" | "video";
  headers: Pick<Headers, "get">;
  stream: ReadableStream<Uint8Array>;
  range?: string;
  maxBytes: number;
  expectedBytes?: number;
  expectedMime?: string;
}

/** Return only the headers of an inline, authorized media response. */
export async function businessPreviewResponse(media: PreviewMedia): Promise<Response> {
  const type = media.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  const allowed = media.type === "video" ? /^video\/(mp4|quicktime|webm)$/ : /^image\/(jpeg|png|webp|gif|avif)$/;
  const partial = media.headers.get("content-range");
  const span = partial && /^bytes (\d{1,12})-(\d{1,12})\/(\d{1,12})$/.exec(partial);
  const total = span ? Number(span[3]) : Number(media.headers.get("content-length"));
  const start = span ? Number(span[1]) : 0;
  const end = span ? Number(span[2]) : total - 1;
  const length = end - start + 1;
  const contentLength = media.headers.get("content-length");
  const encoding = media.headers.get("content-encoding");
  const rangeStart = media.range?.slice(6).split("-")[0];
  const rangeEnd = media.range?.split("-")[1];
  const matchesRange = !span || (media.range &&
    start === (rangeStart ? Number(rangeStart) : Math.max(0, total - Number(rangeEnd))) &&
    end === (rangeStart && rangeEnd ? Math.min(total - 1, Number(rangeEnd)) : total - 1));
  if (!type || !allowed.test(type) || (media.expectedMime !== undefined && type !== media.expectedMime) ||
      !Number.isSafeInteger(total) || total < 1 || total > media.maxBytes ||
      (media.expectedBytes !== undefined && total !== media.expectedBytes) ||
      (partial && (!span || start > end || end >= total || !matchesRange)) ||
      (contentLength && Number(contentLength) !== length) || (encoding && encoding !== "identity")) {
    await media.stream.cancel().catch(() => undefined);
    throw new BusinessError("preview_unavailable", 404);
  }

  let received = 0;
  const stream = media.stream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > length) throw new Error("invalid_preview_length");
      controller.enqueue(chunk);
    },
    flush() {
      if (received !== length) throw new Error("invalid_preview_length");
    },
  }));
  const headers = new Headers({
    "Content-Type": type,
    "Content-Length": String(length),
    "Content-Disposition": "inline",
    "Cache-Control": "private, no-store, max-age=0",
    "Vary": "Cookie",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Referrer-Policy": "no-referrer",
  });
  if (partial) headers.set("Content-Range", partial);
  if (partial || media.headers.get("accept-ranges") === "bytes") headers.set("Accept-Ranges", "bytes");
  return new Response(stream, { headers, status: partial ? 206 : 200 });
}
