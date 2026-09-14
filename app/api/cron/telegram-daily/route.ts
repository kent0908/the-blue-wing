import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendTelegram, telegramConfigured } from "@/lib/telegram";
import { dailyReportText, runAlertScan } from "@/lib/telegramReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * GET /api/cron/telegram-daily — scheduled by vercel.json at 01:00 UTC
 * (09:00 Taipei): yesterday's digest, then the threshold alert scan.
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on its own once that
 * env var exists; nothing else can trigger it.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: { message: "unauthorized" } }, { status: 401 });
  if (!telegramConfigured()) return NextResponse.json({ sent: false, reason: "telegram_unconfigured" });
  const text = await dailyReportText();
  const sent = await sendTelegram(text);
  const findings = await runAlertScan();
  return NextResponse.json({ sent: sent.ok, error: sent.error ?? null, findings });
}
