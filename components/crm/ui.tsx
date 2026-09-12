"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/* ---- formatting ---------------------------------------------------------- */

export const usd = (n: number | null | undefined, digits = 2) => (n === null || n === undefined ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`);
export const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-US"));
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toFixed(1)}%`);
export const dt = (s: string | number | null | undefined) => (s ? new Date(s).toLocaleString("zh-TW", { hour12: false }) : "—");
export const day = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("zh-TW") : "—");

/* ---- primitives ---------------------------------------------------------- */

export function Card({ title, sub, right, children, className = "" }: { title?: string; sub?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-[#232323] bg-[#121212] ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 border-b border-[#1e1e1e] px-5 py-3.5">
          <div>
            {title && <h2 className="text-[13.5px] font-medium text-white">{title}</h2>}
            {sub && <p className="mt-0.5 text-[11.5px] text-[#7d7d7d]">{sub}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone = "default" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "default" | "good" | "bad" | "accent" }) {
  const color = tone === "good" ? "text-[#7ff0cd]" : tone === "bad" ? "text-[#ff9b9b]" : tone === "accent" ? "text-[#8ab4ff]" : "text-white";
  return (
    <div className="rounded-2xl border border-[#232323] bg-[#121212] px-5 py-4">
      <div className="text-[11.5px] text-[#8a8a8a]">{label}</div>
      <div className={`mt-1 text-[26px] font-semibold tabular-nums leading-tight ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-[#6d6d6d]">{sub}</div>}
    </div>
  );
}

export function RangePicker({ value, onChange, options = [7, 30, 90, 180, 365] }: { value: number; onChange: (d: number) => void; options?: number[] }) {
  return (
    <div className="flex gap-1 rounded-lg bg-[#1a1a1a] p-0.5">
      {options.map((d) => (
        <button key={d} type="button" onClick={() => onChange(d)} className={`rounded-md px-2.5 py-1 text-[12px] ${value === d ? "bg-[#2a2a2a] text-white" : "text-[#8a8a8a] hover:text-white"}`}>
          {d} 天
        </button>
      ))}
    </div>
  );
}

export const fieldCls = "h-9 rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-2.5 text-[12.5px] text-white placeholder:text-[#5c5c5c] focus:border-[#4a4a4a] focus:outline-none";
export const btnCls = "h-9 rounded-lg bg-[#1f1f1f] px-3 text-[12.5px] text-[#d4d4d4] hover:bg-[#282828] disabled:opacity-40";
export const primaryBtnCls = "h-9 rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-3.5 text-[12.5px] font-medium text-[#0a1a16] hover:brightness-105 disabled:opacity-50";

export function Table({ head, children, minWidth = 480 }: { head: ReactNode[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]" style={{ minWidth }}>
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-[#7d7d7d]">
            {head.map((h, i) => (
              <th key={i} className="border-b border-[#1e1e1e] px-2 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const td = "border-b border-[#171717] px-2 py-2 align-top";
export const tdNum = `${td} text-right tabular-nums`;

/* ---- charts (inline SVG, no deps) ---------------------------------------- */

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(Math.max(200, Math.floor(entries[0].contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

export interface Series {
  name: string;
  color: string;
  values: number[];
  /** draw as bars instead of a line */
  bars?: boolean;
  format?: (v: number) => string;
}

/**
 * Multi-series line/bar chart on a shared x (dates) with per-series scaling
 * when `independent` — used for money vs counts on one panel.
 */
export function LineChart({ labels, series, height = 200, independent = false }: { labels: string[]; series: Series[]; height?: number; independent?: boolean }) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 22, r: 22, t: 12, b: 22 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const n = labels.length;
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const globalMax = Math.max(1, ...series.flatMap((s) => s.values));
  const y = (v: number, s: Series) => {
    const max = independent ? Math.max(1, ...s.values) : globalMax;
    return pad.t + ih - (v / max) * ih;
  };
  const step = n <= 1 ? iw : iw / (n - 1);
  const tickEvery = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(iw / 70))));
  return (
    <div ref={ref} className="relative">
      <svg width={w} height={height} className="block" onMouseLeave={() => setHover(null)} onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left - pad.l;
        setHover(n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(px / step))));
      }}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad.l} x2={w - pad.r} y1={pad.t + ih - f * ih} y2={pad.t + ih - f * ih} stroke="#1f1f1f" />
        ))}
        {series.filter((s) => s.bars).map((s) => (
          <g key={s.name}>
            {s.values.map((v, i) => {
              const bw = Math.max(2, step * 0.6);
              const top = y(v, s);
              return <rect key={i} x={x(i) - bw / 2} y={top} width={bw} height={Math.max(0, pad.t + ih - top)} fill={s.color} opacity={0.55} rx={1.5} />;
            })}
          </g>
        ))}
        {series.filter((s) => !s.bars).map((s) => (
          <g key={s.name}>
            <path d={s.values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v, s).toFixed(1)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
            {hover !== null && <circle cx={x(hover)} cy={y(s.values[hover] ?? 0, s)} r={3.5} fill={s.color} />}
          </g>
        ))}
        {labels.map((l, i) => (i % tickEvery === 0 || i === n - 1) && (
          <text key={l} x={x(i)} y={height - 6} textAnchor="middle" fontSize={10} fill="#6d6d6d">
            {l.slice(5)}
          </text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="#3a3a3a" strokeDasharray="3 3" />}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-1 rounded-lg border border-[#2a2a2a] bg-[#0f0f0f]/95 px-2.5 py-1.5 text-[11px] shadow-xl" style={{ left: Math.min(w - 170, Math.max(0, x(hover) + 10)) }}>
          <div className="mb-0.5 text-[#8a8a8a]">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span className="text-[#c9c9c9]">{s.name}</span>
              <span className="ml-auto pl-3 tabular-nums text-white">{(s.format ?? String)(s.values[hover] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-[#8a8a8a]">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "err" | "info"; children: ReactNode }) {
  const cls = kind === "ok" ? "border-[#25473f] bg-[#11251f] text-[#9af2da]" : kind === "err" ? "border-[#4a2020] bg-[#1a1010] text-[#ffb4b4]" : "border-[#2a3550] bg-[#101624] text-[#a9c1ff]";
  return <div className={`rounded-lg border px-3 py-2 text-[12.5px] ${cls}`}>{children}</div>;
}

export function useApi<T>(url: string | null): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    // deferred so the effect body itself doesn't set state synchronously
    queueMicrotask(() => alive && setLoading(true));
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
        return j as T;
      })
      .then((j) => {
        if (!alive) return;
        setData(j);
        setError(null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
