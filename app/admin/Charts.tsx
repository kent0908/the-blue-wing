"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ---- palette (validated for the app's dark surface ~#161616) ---- */
const INK = "#f2f2f2";
const MUTED = "#8a8a8a";
const GRID = "#242424";
const BASELINE = "#3a3a3a";
const BLUE = "#3987e5";
const RED = "#e66767";
const PLAN_RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab"]; // ordinal: free → studio

const RANGES = [7, 30, 90] as const;

interface Analytics {
  range: number;
  signups: { date: string; count: number }[];
  credits: { date: string; granted: number; spent: number }[];
  plans: { code: string; name: string; count: number }[];
}

/* ---- helpers ---- */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(e.contentRect.width);
    });
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceCeil(v: number) {
  if (v <= 5) return 5;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

const md = (iso: string) => iso.slice(5).replace("-", "/");
const fmt = (n: number) => n.toLocaleString();

/** Path for a rect with two rounded corners on one end (the data end). */
function cappedBar(x: number, y: number, w: number, h: number, r: number, end: "top" | "bottom") {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  if (h <= 0) return "";
  if (end === "top") {
    return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
  }
  return `M${x},${y} L${x + w},${y} L${x + w},${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} L${x + rr},${y + h} Q${x},${y + h} ${x},${y + h - rr} Z`;
}

/* ---- panel shell ---- */
function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#262626] bg-[#161616] p-4">
      <div className="text-[13px] font-medium text-white">{title}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-[#8a8a8a]">{sub}</div>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

/* ---- 1. signups over time (area, single series) ---- */
function SignupsArea({ data }: { data: Analytics["signups"] }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = 220;
  const pad = { t: 14, r: 16, b: 24, l: 40 };
  const n = data.length;
  const iw = Math.max(0, w - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const maxY = niceCeil(Math.max(1, ...data.map((d) => d.count)));
  const x = (i: number) => (n <= 1 ? pad.l : pad.l + (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / maxY) * ih;

  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join(" ");
  const area = w ? `${line} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : "";
  const ticks = maxY <= 5 ? [0, maxY] : [0, Math.round(maxY / 2), maxY];
  const xIdx = n <= 8 ? data.map((_, i) => i) : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    if (n <= 1) return setHover(0);
    const i = Math.round(((mx - pad.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div ref={ref} className="relative">
      {w > 0 && (
        <svg width={w} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmt(Math.round(t))}
              </text>
            </g>
          ))}
          {xIdx.map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill={MUTED}>
              {md(data[i].date)}
            </text>
          ))}
          <defs>
            <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BLUE} stopOpacity={0.22} />
              <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#sg)" />
          <path d={line} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover != null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke={BASELINE} strokeWidth={1} />
              <circle cx={x(hover)} cy={y(data[hover].count)} r={4} fill={BLUE} stroke="#161616" strokeWidth={2} />
            </>
          )}
        </svg>
      )}
      {hover != null && data[hover] && (
        <div
          className="pointer-events-none absolute top-1 rounded-md border border-[#333] bg-[#1c1c1c] px-2 py-1 text-[11px] text-white shadow-lg"
          style={{ left: Math.max(50, Math.min(w - 50, x(hover))), transform: "translateX(-50%)" }}
        >
          <span className="text-[#8a8a8a]">{data[hover].date}</span> · 新註冊 {fmt(data[hover].count)}
        </div>
      )}
    </div>
  );
}

/* ---- 2. credits granted vs spent (diverging columns) ---- */
function CreditsDiverging({ data }: { data: Analytics["credits"] }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = 210;
  const pad = { t: 22, r: 16, b: 22, l: 48 };
  const n = data.length;
  const iw = Math.max(0, w - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const half = ih / 2;
  const cy = pad.t + half;
  const maxMag = niceCeil(Math.max(1, ...data.flatMap((d) => [d.granted, d.spent])));
  const step = n ? iw / n : 0;
  const bw = Math.min(22, Math.max(2, step - 3));
  const cx = (i: number) => pad.l + step * i + (step - bw) / 2;
  const h = (v: number) => (v / maxMag) * (half - 2);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - pad.l) / step);
    setHover(i >= 0 && i < n ? i : null);
  };

  return (
    <div ref={ref} className="relative">
      <div className="mb-2 flex items-center gap-4 text-[11px] text-[#8a8a8a]">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: BLUE }} />發放</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: RED }} />消耗</span>
      </div>
      {w > 0 && (
        <svg width={w} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {[
            { v: maxMag, yy: cy - (half - 2) },
            { v: 0, yy: cy },
            { v: maxMag, yy: cy + (half - 2) },
          ].map((t, i) => (
            <g key={i}>
              <line x1={pad.l} x2={w - pad.r} y1={t.yy} y2={t.yy} stroke={i === 1 ? BASELINE : GRID} strokeWidth={1} />
              <text x={pad.l - 8} y={t.yy + 3.5} textAnchor="end" fontSize={10} fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmt(t.v)}
              </text>
            </g>
          ))}
          {data.map((d, i) => (
            <g key={i} opacity={hover == null || hover === i ? 1 : 0.4}>
              {d.granted > 0 && <path d={cappedBar(cx(i), cy - h(d.granted), bw, h(d.granted), 4, "top")} fill={BLUE} />}
              {d.spent > 0 && <path d={cappedBar(cx(i), cy + 2, bw, h(d.spent), 4, "bottom")} fill={RED} />}
            </g>
          ))}
        </svg>
      )}
      {hover != null && data[hover] && (
        <div
          className="pointer-events-none absolute top-7 rounded-md border border-[#333] bg-[#1c1c1c] px-2 py-1 text-[11px] text-white shadow-lg"
          style={{ left: Math.max(60, Math.min(w - 60, cx(hover) + bw / 2)), transform: "translateX(-50%)" }}
        >
          <div className="text-[#8a8a8a]">{data[hover].date}</div>
          <div><span style={{ color: BLUE }}>發放</span> {fmt(data[hover].granted)} · <span style={{ color: RED }}>消耗</span> {fmt(data[hover].spent)}</div>
        </div>
      )}
    </div>
  );
}

/* ---- 3. plan distribution (horizontal ordinal bars) ---- */
function PlansBars({ data }: { data: Analytics["plans"] }) {
  const [ref, wRaw] = useWidth();
  const w = Math.min(wRaw, 620);
  const rowH = 34;
  const labelW = 84;
  const valueW = 84;
  const trackW = Math.max(0, w - labelW - valueW);
  const total = data.reduce((s, d) => s + d.count, 0);
  const maxC = Math.max(1, ...data.map((d) => d.count));
  const H = data.length * rowH + 6;
  const bh = 18;

  return (
    <div ref={ref}>
      {w > 0 && (
        <svg width={w} height={H}>
          {data.map((d, i) => {
            const yTop = i * rowH + 3;
            const len = (d.count / maxC) * trackW;
            const pct = total ? Math.round((d.count / total) * 100) : 0;
            return (
              <g key={d.code}>
                <text x={0} y={yTop + bh / 2 + 3.5} fontSize={11.5} fill={MUTED}>{d.name}</text>
                <rect x={labelW} y={yTop} width={trackW} height={bh} rx={3} fill={GRID} />
                {d.count > 0 && (
                  <path d={cappedBar(labelW, yTop, Math.max(len, 3), bh, 4, "top")} fill={PLAN_RAMP[i] ?? PLAN_RAMP[3]} />
                )}
                <text x={labelW + trackW + 8} y={yTop + bh / 2 + 3.5} fontSize={11.5} fill={INK} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {fmt(d.count)} <tspan fill={MUTED}>({pct}%)</tspan>
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/* ---- container ---- */
export default function AdminCharts() {
  const [range, setRange] = useState<number>(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [err, setErr] = useState(false);

  const load = useCallback(async (days: number) => {
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}`);
      if (!res.ok) return setErr(true);
      setData(await res.json());
      setErr(false);
    } catch {
      setErr(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state only after an await
    load(range);
  }, [load, range]);

  if (err) return null;

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`h-7 rounded-md px-2.5 text-[12px] ${range === r ? "bg-[#2e2e2e] text-white" : "bg-[#1c1c1c] text-[#8a8a8a] hover:bg-[#242424]"}`}
          >
            {r} 天
          </button>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <Panel title="每日新註冊" sub={`近 ${range} 天`}>
          {data ? <SignupsArea data={data.signups} /> : <div className="h-[220px] bw-shimmer rounded-lg" />}
        </Panel>
        <Panel title="每日點數：發放 vs 消耗" sub={`近 ${range} 天`}>
          {data ? <CreditsDiverging data={data.credits} /> : <div className="h-[210px] bw-shimmer rounded-lg" />}
        </Panel>
        <div className="lg:col-span-2">
          <Panel title="方案分布" sub="目前所有使用者">
            {data ? <PlansBars data={data.plans} /> : <div className="h-[140px] bw-shimmer rounded-lg" />}
          </Panel>
        </div>
      </div>
    </div>
  );
}
