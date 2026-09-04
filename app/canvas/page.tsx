"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconPlus, IconCanvas, IconTrash } from "@/components/Icons";

interface WorkflowSummary {
  id: string;
  name: string;
  nodeCount: number;
  updatedAt: string;
}

export default function CanvasHomePage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    fetch("/api/canvas")
      .then((r) => {
        if (r.status === 401) {
          router.push("/login?next=/canvas");
          return null;
        }
        return r.ok ? r.json() : Promise.reject(new Error());
      })
      .then((j: { workflows: WorkflowSummary[] } | null) => {
        if (j) setWorkflows(j.workflows);
      })
      .catch(() => setError("載入失敗，稍後再試"));
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const createWorkflow = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "未命名畫布" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || "建立失敗");
      router.push(`/canvas/${j.workflow.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "建立失敗");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("刪除這個畫布？此動作無法復原。")) return;
    await fetch(`/api/canvas/${id}`, { method: "DELETE" });
    setWorkflows((cur) => cur?.filter((w) => w.id !== id) ?? cur);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1080px] px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">智慧畫布</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-[#8a8a8a]">
              把文字、圖片、影片生成節點拉在一起，自由搭建你的工作流。
            </p>
          </div>
          <button
            type="button"
            onClick={createWorkflow}
            disabled={creating}
            className="flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] px-4 text-[13px] font-medium text-[#0a1a16] transition-[filter] hover:brightness-105 disabled:opacity-50"
          >
            <IconPlus className="h-4 w-4" />
            {creating ? "建立中…" : "建立新畫布"}
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-[#262626] bg-[#141414] px-4 py-3 text-[12px] leading-relaxed text-[#8a8a8a]">
          目前支援四種節點：文字、圖片生成、影片生成、讀取素材 — 都是接這個站已經在跑的真實 API，會確實消耗點數。圖層合成、字型、錄音配音、Agent
          呼叫其他節點當工具這些 ByteDance Canvas 才有的功能，這裡還沒有對應的 API 可以接，所以先不做假的。
        </div>

        {error && <p className="mt-4 text-[13px] text-[#ff9b9b]">{error}</p>}

        {workflows === null && !error && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bw-shimmer h-[120px] rounded-xl" />
            ))}
          </div>
        )}

        {workflows?.length === 0 && (
          <div className="mt-16 text-center text-[13px] text-[#5c5c5c]">
            還沒有任何畫布
            <br />
            按右上角「建立新畫布」開始
          </div>
        )}

        {workflows && workflows.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {workflows.map((w) => (
              <Link
                key={w.id}
                href={`/canvas/${w.id}`}
                className="group relative flex h-[120px] flex-col justify-between rounded-xl border border-[#262626] bg-[#141414] p-4 transition-colors hover:border-[#3a3a3a]"
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#1f1f1f] text-[#7ff0cd]">
                    <IconCanvas className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-white">{w.name}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#7d7d7d]">
                  <span>{w.nodeCount} 個節點</span>
                  <span>{new Date(w.updatedAt).toLocaleDateString("zh-TW")}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    remove(w.id);
                  }}
                  aria-label="刪除"
                  className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md text-[#6d6d6d] opacity-0 transition-opacity hover:bg-[#241414] hover:text-[#ff8a8a] group-hover:opacity-100"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
