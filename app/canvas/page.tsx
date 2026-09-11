"use client";
import Image from "next/image";
import CanvasVideoPreview from "@/components/canvas/CanvasVideoPreview";

import { useCallback, useEffect, useState } from "react";
import ShareWorkflowDialog from "@/components/canvas/ShareWorkflowDialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconPlus, IconCanvas, IconTrash, IconGlobe, IconApps } from "@/components/Icons";

interface WorkflowSummary {
  id: string;
  name: string;
  nodeCount: number;
  updatedAt: string;
}

interface TemplateSummary {
  id: number;
  name: string;
  description: string;
  nodeCount: number;
  createdAt: string;
  cover?: string;
  previewVideo?: string;
}

interface PlazaPost {
  id: number;
  name: string;
  description: string;
  nodeCount: number;
  copyCount: number;
  authorName: string;
  isOwn: boolean;
  createdAt: string;
}

/** Small shared card shell — used by all three galleries (我的畫布 already
 *  had its own markup; 官方模板/藍翼廣場 reuse the same visual language so
 *  the page reads as one system, not three bolted-together lists). */
function GalleryCard({
  icon,
  title,
  subtitle,
  badge,
  onOpen,
  onOpenLabel,
  corner,
  cover,
  previewVideo,
  previewHref,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  onOpen: () => void;
  onOpenLabel: string;
  corner?: React.ReactNode;
  cover?: string;
  previewVideo?: string;
  previewHref?: string;
}) {
  return (
    <div className="group relative flex min-h-[160px] flex-col justify-between rounded-xl border border-[#262626] bg-[#141414] p-4 transition-colors hover:border-[#3a3a3a]">
      {previewVideo ? <CanvasVideoPreview src={previewVideo} poster={cover} title={title} /> : cover && <Image width={3840} height={2160} src={cover} alt={title} className="mb-3 aspect-video w-full rounded-lg bg-white object-contain" />}
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#1f1f1f] text-[#7ff0cd]">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-white">{title}</span>
      </div>
      <div className="min-w-0">
        <p className="line-clamp-3 text-[11.5px] text-[#8a8a8a]">{subtitle}</p>
        <div className="mt-2 flex items-center justify-between">
          {previewHref && <Link href={previewHref} className="text-xs text-emerald-300 hover:underline">預覽節點</Link>}
          {badge ? <span className="text-[11px] text-[#7d7d7d]">{badge}</span> : <span />}
          <button
            type="button"
            onClick={onOpen}
            className="rounded-full bg-[#1f1f1f] px-3 py-1 text-[11px] text-[#c9c9c9] transition-colors hover:bg-[#272727] hover:text-white"
          >
            {onOpenLabel}
          </button>
        </div>
      </div>
      {corner && <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">{corner}</div>}
    </div>
  );
}

export default function CanvasHomePage() {
  const router = useRouter();
  const [shareId, setShareId] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [plaza, setPlaza] = useState<PlazaPost[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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

    fetch("/api/canvas/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((j: { templates: TemplateSummary[] }) => setTemplates(j.templates ?? []))
      .catch(() => setTemplates([]));

    fetch("/api/canvas/plaza")
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((j: { posts: PlazaPost[] }) => setPlaza(j.posts ?? []))
      .catch(() => setPlaza([]));

    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((j: { user?: { role?: string } | null }) => setIsAdmin(j.user?.role === "admin"))
      .catch(() => {});
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
    const res = await fetch(`/api/canvas/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) { setError("刪除失敗，畫布仍保留，請稍後再試"); return; }
    setWorkflows((cur) => cur?.filter((w) => w.id !== id) ?? cur);
  };

  const publishTemplate = async (w: WorkflowSummary) => {
    const name = prompt("官方模板名稱：", w.name);
    if (!name?.trim()) return;
    const description = prompt("簡短說明（可留空）：", "") ?? "";
    setBusyId(w.id);
    try {
      const res = await fetch("/api/canvas/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), workflowId: w.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || "發布失敗");
      alert("已發布為官方模板");
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "發布失敗");
    } finally {
      setBusyId(null);
    }
  };

  const shareToPlaza = (w: WorkflowSummary) => setShareId(w.id);

  const cloneTemplate = async (id: number) => {
    setBusyId(`t${id}`);
    try {
      const res = await fetch(`/api/canvas/templates/${id}/clone`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || "複製失敗");
      router.push(`/canvas/${j.workflowId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "複製失敗");
      setBusyId(null);
    }
  };

  const clonePlazaPost = async (id: number) => {
    setBusyId(`p${id}`);
    try {
      const res = await fetch(`/api/canvas/plaza/${id}/clone`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || "複製失敗");
      router.push(`/canvas/${j.workflowId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "複製失敗");
      setBusyId(null);
    }
  };

  const deleteTemplate = async (id: number) => {
    if (!confirm("刪除這個官方模板？")) return;
    await fetch(`/api/canvas/templates/${id}`, { method: "DELETE" });
    setTemplates((cur) => cur?.filter((t) => t.id !== id) ?? cur);
  };

  const deletePlazaPost = async (id: number) => {
    if (!confirm("刪除這篇分享？")) return;
    await fetch(`/api/canvas/plaza/${id}`, { method: "DELETE" });
    setPlaza((cur) => cur?.filter((p) => p.id !== id) ?? cur);
  };

  return (
    <div className="h-full overflow-y-auto">
      {shareId !== null && <ShareWorkflowDialog workflows={workflows || []} initialId={shareId} onClose={() => setShareId(null)} onPublished={() => { setShareId(null); load(); }} />}
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

        {error && <p className="mt-4 text-[13px] text-[#ff9b9b]">{error}</p>}

        {/* 我的畫布 */}
        <section className="mt-8">
          <h2 className="text-[15px] font-medium">我的畫布</h2>

          {workflows === null && !error && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bw-shimmer h-[120px] rounded-xl" />
              ))}
            </div>
          )}

          {workflows?.length === 0 && (
            <div className="mt-16 text-center text-[13px] text-[#5c5c5c]">
              還沒有任何畫布
              <br />
              按右上角「建立新畫布」開始，或下面挑一個模板／廣場分享來改
            </div>
          )}

          {workflows && workflows.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                  <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        shareToPlaza(w);
                      }}
                      disabled={busyId === w.id}
                      aria-label="分享到廣場"
                      title="分享到藍翼廣場"
                      className="grid h-6 w-6 place-items-center rounded-md text-[#6d6d6d] hover:bg-[#1a2420] hover:text-[#7ff0cd] disabled:opacity-50"
                    >
                      <IconGlobe className="h-3.5 w-3.5" />
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          publishTemplate(w);
                        }}
                        disabled={busyId === w.id}
                        aria-label="發布為官方模板"
                        title="發布為官方模板"
                        className="grid h-6 w-6 place-items-center rounded-md text-[#6d6d6d] hover:bg-[#1a2420] hover:text-[#7ff0cd] disabled:opacity-50"
                      >
                        <IconApps className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        remove(w.id);
                      }}
                      aria-label="刪除"
                      className="grid h-6 w-6 place-items-center rounded-md text-[#6d6d6d] hover:bg-[#241414] hover:text-[#ff8a8a]"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 官方模板 */}
        <section className="mt-8">
          <div className="flex items-center gap-2">
            <IconApps className="h-4 w-4 text-[#7ff0cd]" />
            <h2 className="text-[15px] font-medium">官方模板</h2>
            <span className="text-[11.5px] text-[#6d6d6d]">— 直接複製使用，開箱即用的工作流</span>
          </div>
          {templates === null ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bw-shimmer h-[132px] rounded-xl" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-[#5c5c5c]">目前還沒有官方模板</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <GalleryCard
                  key={t.id}
                  cover={t.cover}
                  previewVideo={t.previewVideo}
                  previewHref={t.id < 0 ? `/canvas/templates/${t.id}` : undefined}
                  icon={<IconApps className="h-4 w-4" />}
                  title={t.name}
                  subtitle={t.description || `${t.nodeCount} 個節點`}
                  badge={`${t.nodeCount} 個節點`}
                  onOpen={() => cloneTemplate(t.id)}
                  onOpenLabel={busyId === `t${t.id}` ? "複製中…" : "複製到我的畫布"}
                  corner={
                    isAdmin && t.id > 0 ? (
                      <button
                        type="button"
                        onClick={() => deleteTemplate(t.id)}
                        aria-label="刪除範本"
                        className="grid h-6 w-6 place-items-center rounded-md text-[#6d6d6d] hover:bg-[#241414] hover:text-[#ff8a8a]"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* 藍翼廣場 */}
        <section className="mt-8">
          <div className="flex items-center gap-2">
            <IconGlobe className="h-4 w-4 text-[#7ff0cd]" />
            <h2 className="text-[15px] font-medium">藍翼廣場</h2><button type="button" onClick={() => setShareId("")} className="rounded-full bg-[#7ff0cd] px-3 py-2 text-xs text-black">＋ 上傳工作流</button>
            <span className="text-[11.5px] text-[#6d6d6d]">— 大家分享出來的工作流，歡迎拿去用</span>
          </div>
          {plaza === null ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bw-shimmer h-[132px] rounded-xl" />
              ))}
            </div>
          ) : plaza.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-[#5c5c5c]">還沒有人分享工作流，來當第一個吧</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plaza.map((p) => (
                <GalleryCard
                  key={p.id}
                  icon={<IconGlobe className="h-4 w-4" />}
                  title={p.name}
                  subtitle={p.description || `by ${p.authorName}`}
                  badge={`by ${p.authorName} · 複製 ${p.copyCount} 次`}
                  onOpen={() => clonePlazaPost(p.id)}
                  onOpenLabel={busyId === `p${p.id}` ? "複製中…" : "複製到我的畫布"}
                  corner={
                    p.isOwn || isAdmin ? (
                      <button
                        type="button"
                        onClick={() => deletePlazaPost(p.id)}
                        aria-label="刪除分享"
                        className="grid h-6 w-6 place-items-center rounded-md text-[#6d6d6d] hover:bg-[#241414] hover:text-[#ff8a8a]"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
