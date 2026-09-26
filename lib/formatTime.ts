/** Small shared formatters for generation timestamps / durations (client-safe). */

export function formatDateTime(ts: number | string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Callers with a locale pass their tr(); the CRM back office is Chinese-only and omits it. */
type Translate = (zh: string, vars?: Record<string, string | number>) => string;
const ZH: Translate = (zh, vars) => zh.replace(/\{(\w+)\}/g, (_, key) => String(vars?.[key] ?? ""));

export function formatDuration(ms: number | null | undefined, tr: Translate = ZH): string {
  if (!ms || ms <= 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return tr("{s} 秒", { s });
  const m = Math.floor(s / 60);
  return tr("{m} 分 {s} 秒", { m, s: s % 60 });
}

/** "生成於 2026/09/12 15:04 · 耗時 23 秒" — the pieces that are known */
export function generationTimeLabel(createdAt: number | string, durationMs?: number | null, tr: Translate = ZH): string {
  const parts = [tr("生成於 {when}", { when: formatDateTime(createdAt) })];
  const d = formatDuration(durationMs, tr);
  if (d) parts.push(tr("耗時 {d}", { d }));
  return parts.join(" · ");
}
