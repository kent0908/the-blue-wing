import { get } from "@vercel/blob";
import sharp from "sharp";
import { publishedCoverPath } from "@/lib/canvas/publishedCovers";
export const runtime = "nodejs";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
 const pathname = publishedCoverPath((await ctx.params).id);
 if (!pathname) return new Response(null, { status: 404 });
 try {
  const blob = await get(pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) return new Response(null, { status: 404 });
  const bytes = await new Response(blob.stream).arrayBuffer();
  const image = await sharp(Buffer.from(bytes)).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  return new Response(new Uint8Array(image), { headers: {
   "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400, s-maxage=604800", "X-Content-Type-Options": "nosniff",
  } });
 } catch { return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
