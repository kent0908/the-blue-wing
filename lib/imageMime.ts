/**
 * Sniffs the real image mime type from the start of base64-encoded bytes.
 *
 * Found via a real E2E test of /api/images/edit on 2026-09-06: asked
 * Dola-Seedream-5.0-pro for `output_format: "png"` and it came back with
 * genuine JPEG bytes (magic number FF D8 FF, i.e. base64 starting "/9j/") —
 * upstream ignored the requested format. Both /api/images and
 * /api/images/edit used to hardcode `data:image/png;base64,...` for a
 * b64_json response, so that JPEG payload was being served under a false
 * "image/png" label — most `<img>` tags still render it fine since browsers
 * sniff actual bytes, but anything that trusts the declared type (a strict
 * fetch/validate step, an explicit content-type check) would not. Sniffing
 * here fixes the label at the source instead of relying on every consumer
 * to sniff bytes themselves.
 */
export function sniffImageMimeFromBase64(b64: string, fallback = "image/png"): string {
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("iVBORw0KGgo")) return "image/png";
  if (b64.startsWith("R0lGOD")) return "image/gif";
  if (b64.startsWith("UklGR")) return "image/webp";
  return fallback;
}
