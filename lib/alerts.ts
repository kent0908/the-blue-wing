import { sql } from "./db";
import { esc, sendTelegram, telegramConfigured } from "./telegram";

/**
 * Operational alerts → Telegram, with a per-key cooldown so one outage
 * produces one message (plus a count) instead of one per failed request.
 *
 * raiseAlert() is meant to be called fire-and-forget (`void raiseAlert(…)`)
 * from hot paths — it swallows every error, and when the bot isn't
 * configured it still records the event in alert_events so /crm and the
 * /alerts command can show what would have fired.
 */

export interface AlertInput {
  /** stable id for dedupe, e.g. "gen_fail:video:SIRAYA-Seedance-2.5" */
  key: string;
  title: string;
  /** free text, escaped for HTML by us */
  detail?: string;
  /** minutes to stay quiet after a send for the same key (default 60) */
  cooldownMinutes?: number;
  level?: "warn" | "error";
}

export interface AlertRow {
  key: string;
  title: string;
  level: string;
  detail: string;
  count: number;
  last_sent_at: string | null;
  last_seen_at: string;
}

export async function raiseAlert(input: AlertInput): Promise<{ sent: boolean; suppressed: boolean }> {
  const cooldown = Math.max(1, input.cooldownMinutes ?? 60);
  const level = input.level ?? "error";
  const detail = (input.detail ?? "").slice(0, 2000);
  try {
    // One upsert decides whether this occurrence is inside the cooldown.
    const { rows } = await sql<{ due: boolean; count: number }>`
      insert into alert_events (key, title, level, detail, count, last_seen_at)
      values (${input.key}, ${input.title}, ${level}, ${detail}, 1, now())
      on conflict (key) do update set
        title = excluded.title,
        level = excluded.level,
        detail = excluded.detail,
        count = case when alert_events.last_sent_at is not null and alert_events.last_sent_at < now() - make_interval(mins => ${cooldown}) then 1 else alert_events.count + 1 end,
        last_seen_at = now()
      returning (last_sent_at is null or last_sent_at < now() - make_interval(mins => ${cooldown})) as due, count
    `;
    const due = rows[0]?.due === true;
    if (!due) return { sent: false, suppressed: true };
    if (!telegramConfigured()) return { sent: false, suppressed: false };
    const icon = level === "error" ? "🚨" : "⚠️";
    const text = `${icon} <b>${esc(input.title)}</b>\n${detail ? esc(detail) + "\n" : ""}<i>${esc(new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }))} · 同類事件 ${cooldown} 分鐘內只通知一次</i>`;
    const r = await sendTelegram(text);
    if (r.ok) await sql`update alert_events set last_sent_at = now() where key = ${input.key}`;
    return { sent: r.ok, suppressed: false };
  } catch {
    return { sent: false, suppressed: false };
  }
}

export async function recentAlerts(limit = 20): Promise<AlertRow[]> {
  const { rows } = await sql<AlertRow>`select key, title, level, detail, count, last_sent_at, last_seen_at from alert_events order by last_seen_at desc limit ${limit}`;
  return rows;
}

/**
 * Hook for paidCall: a provider-side failure (5xx / network) after a charge
 * was taken. 4xx are the user's own problem (prompt rejected, bad params)
 * and are not worth waking anyone up for.
 */
export function alertGenerationFailure(kind: string, model: string, err: unknown): void {
  const status = (err as { status?: unknown })?.status;
  const providerSide = typeof status !== "number" || status >= 500;
  if (!providerSide) return;
  const message = err instanceof Error ? err.message : String(err);
  void raiseAlert({
    key: `gen_fail:${kind}:${model}`,
    title: `生成失敗（${kind}）：${model}`,
    detail: `上游回應 ${typeof status === "number" ? status : "連線失敗"}：${message.slice(0, 300)}\n點數已自動退還。`,
    cooldownMinutes: 30,
  });
}
