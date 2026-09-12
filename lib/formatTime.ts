/** Small shared formatters for generation timestamps / durations (client-safe). */

export function formatDateTime(ts: number | string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  return `${m} 分 ${s % 60} 秒`;
}

/** "生成於 2026/09/12 15:04 · 耗時 23 秒" — the pieces that are known */
export function generationTimeLabel(createdAt: number | string, durationMs?: number | null): string {
  const parts = [`生成於 ${formatDateTime(createdAt)}`];
  const d = formatDuration(durationMs);
  if (d) parts.push(`耗時 ${d}`);
  return parts.join(" · ");
}
