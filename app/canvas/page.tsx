"use client";
import Image from "next/image";
import styles from "./gallery.module.css";
import CanvasVideoPreview from "@/components/canvas/CanvasVideoPreview";

import { useCallback, useEffect, useRef, useState } from "react";
import ShareWorkflowDialog from "@/components/canvas/ShareWorkflowDialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconPlus, IconCanvas, IconTrash, IconGlobe, IconApps } from "@/components/Icons";
import { useLocale, useTr } from "@/lib/i18n/client";

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
  previewImages?: {src: string; label: string}[];
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
  previewImages,
  previewHref,
  busy = false,
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
  previewImages?: {src: string; label: string}[];
  previewHref?: string;
  busy?: boolean;
}) {
  const tr = useTr();
  return (
    <article className={styles.card}>
      {previewImages ? <div className={styles.referencePreview}><div className={styles.referenceImages}>{previewImages.map(item => <figure key={item.src}><Image unoptimized width={1200} height={675} src={item.src} alt={tr(item.label)} /><figcaption>{tr(item.label)}</figcaption></figure>)}</div><p>{tr("參考素材")}</p></div> : previewVideo ? <CanvasVideoPreview src={previewVideo} poster={cover} title={title} /> : cover && <Image width={3840} height={2160} src={cover} unoptimized={cover.startsWith("/api/")} alt={title} className={styles.cover} />}
      <div className={styles.cardHeading}>
        <span className={styles.cardIcon} aria-hidden="true">{icon}</span>
        <h3 className={styles.title}>{title}</h3>
      </div>
      <div className={styles.cardBody}>
        <p className={styles.description}>{subtitle}</p>
        <div className={styles.actions}>
          {badge ? <span className={styles.meta}>{badge}</span> : <span />}
          {previewHref && <Link href={previewHref} className={styles.previewLink}>{tr("預覽節點")}</Link>}
          <button
            type="button"
            onClick={onOpen}
            className={styles.action}
            disabled={busy}
          >
            {onOpenLabel}
          </button>
        </div>
      </div>
      {corner && <div className={styles.corner}>{corner}</div>}
    </article>
  );
}

export default function CanvasHomePage() {
  const tr = useTr();
  const locale = useLocale();
  const copy = locale === "ja" ? { search: "マイキャンバスを検索", noMatch: "一致するキャンバスがありません。", searchHint: "別の名前で検索してください。", deleteFailed: "削除できませんでした。内容はそのまま保存されています。", deleting: "削除中…", deleteTitle: "この作品を削除しますか？", deleteNote: "この操作は元に戻せません。" } : locale === "en" ? { search: "Search my canvases", noMatch: "No matching canvases.", searchHint: "Try another name.", deleteFailed: "Could not delete. Your work is still saved.", deleting: "Deleting…", deleteTitle: "Delete this work?", deleteNote: "This action cannot be undone." } : { search: "搜尋我的畫布", noMatch: "找不到符合的畫布。", searchHint: "試試其他名稱。", deleteFailed: "刪除失敗，作品仍保留，請稍後再試。", deleting: "刪除中…", deleteTitle: "確定刪除這份作品？", deleteNote: "此動作無法復原。" };
  const router = useRouter();
  const [shareId, setShareId] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [plaza, setPlaza] = useState<PlazaPost[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [deletion, setDeletion] = useState<{ kind: "workflow" | "template" | "plaza"; id: string | number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const deleteTrigger = useRef<HTMLElement | null>(null);
  const filteredWorkflows = workflows?.filter(workflow => workflow.name.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)));

  useEffect(() => {
    if (!deletion) return;
    const previousFocus = deleteTrigger.current;
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      if (!controls?.length) { event.preventDefault(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trapFocus);
    return () => { document.removeEventListener("keydown", trapFocus); previousFocus?.focus(); };
  }, [deletion]);

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
      .catch(() => setError(tr("載入失敗，稍後再試")));

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
  }, [router, tr]);

  useEffect(() => {
    load();
  }, [load]);

  const createWorkflow = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tr("未命名畫布") }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || tr("建立失敗"));
      router.push(`/canvas/${j.workflow.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("建立失敗"));
    } finally {
      setCreating(false);
    }
  };

  const requestDeletion = (item: NonNullable<typeof deletion>) => {
    deleteTrigger.current = document.activeElement as HTMLElement | null;
    setDeleteError(null);
    setDeletion(item);
  };
  const remove = async () => {
    if (!deletion || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const { kind, id } = deletion;
    const path = kind === "workflow" ? `/api/canvas/${id}` : kind === "template" ? `/api/canvas/templates/${id}` : `/api/canvas/plaza/${id}`;
    try {
      const res = await fetch(path, { method: "DELETE" });
      if (!res.ok) throw new Error(copy.deleteFailed);
      if (kind === "workflow") setWorkflows(cur => cur?.filter(item => item.id !== id) ?? cur);
      else if (kind === "template") setTemplates(cur => cur?.filter(item => item.id !== id) ?? cur);
      else setPlaza(cur => cur?.filter(item => item.id !== id) ?? cur);
      setDeletion(null);
    } catch {
      setDeleteError(copy.deleteFailed);
    } finally {
      setDeleting(false);
    }
  };

  const publishTemplate = async (w: WorkflowSummary) => {
    const name = prompt(tr("官方模板名稱："), w.name);
    if (!name?.trim()) return;
    const description = prompt(tr("簡短說明（可留空）："), "") ?? "";
    setBusyId(w.id);
    try {
      const res = await fetch("/api/canvas/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), workflowId: w.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || tr("發布失敗"));
      alert(tr("已發布為官方模板"));
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : tr("發布失敗"));
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
      if (!res.ok) throw new Error(j?.error?.message || tr("複製失敗"));
      router.push(`/canvas/${j.workflowId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : tr("複製失敗"));
      setBusyId(null);
    }
  };

  const clonePlazaPost = async (id: number) => {
    setBusyId(`p${id}`);
    try {
      const res = await fetch(`/api/canvas/plaza/${id}/clone`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || tr("複製失敗"));
      router.push(`/canvas/${j.workflowId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : tr("複製失敗"));
      setBusyId(null);
    }
  };

  return (
    <div className={styles.page}>
      {shareId !== null && <ShareWorkflowDialog workflows={workflows || []} initialId={shareId} onClose={() => setShareId(null)} onPublished={() => { setShareId(null); load(); }} />}
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1>{tr("智慧畫布")}</h1>
            <p>
              {tr("把文字、圖片、影片生成節點拉在一起，自由搭建你的工作流。")}
            </p>
          </div>
          <button
            type="button"
            onClick={createWorkflow}
            disabled={creating}
            className={styles.primary}
          >
            <IconPlus className="h-4 w-4" />
            {creating ? tr("建立中…") : tr("建立新畫布")}
          </button>
        </header>

        {error && <p role="alert" className={styles.error}>{tr(error)}</p>}

        {/* 我的畫布 */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>{tr("我的畫布")}{workflows && <span className={styles.count}>{query.trim() ? `${filteredWorkflows?.length ?? 0} / ${workflows.length}` : workflows.length}</span>}</h2>
            <label className={styles.search}>
              <span className="sr-only">{copy.search}</span>
              <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.search} />
            </label>
          </div>

          {workflows === null && !error && (
            <div className={styles.workflowGrid} aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={styles.skeleton} />
              ))}
            </div>
          )}

          {workflows?.length === 0 && (
            <div className={styles.empty}>
              {tr("還沒有任何畫布")}
              <br />
              {tr("按右上角「建立新畫布」開始，或下面挑一個模板／廣場分享來改")}
            </div>
          )}

          {workflows && workflows.length > 0 && filteredWorkflows?.length === 0 && <div className={styles.empty}><p>{copy.noMatch}</p><p>{copy.searchHint}</p></div>}
          {filteredWorkflows && filteredWorkflows.length > 0 && (
            <div className={styles.workflowGrid}>
              {filteredWorkflows.map((w) => (
                <article
                  key={w.id}
                  className={styles.workflow}
                >
                  <Link href={`/canvas/${w.id}`} className={styles.workflowLink}>
                    <span className={styles.workflowIcon}>
                      <IconCanvas className="h-4 w-4" />
                    </span>
                    <h3>{w.name}</h3>
                  </Link>
                  <div className={styles.workflowMeta}>
                    <span>{w.nodeCount} {tr("個節點")}</span>
                    <time dateTime={w.updatedAt}>{new Date(w.updatedAt).toLocaleDateString(locale === "zh-Hant" ? "zh-TW" : locale === "ja" ? "ja-JP" : "en-US", { year: "numeric", month: "short", day: "numeric" })}</time>
                  </div>
                  <div className={styles.workflowActions}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        shareToPlaza(w);
                      }}
                      disabled={busyId === w.id}
                      aria-label={tr("分享到廣場")}
                      title={tr("分享到藍翼廣場")}
                      className={styles.iconButton}
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
                        aria-label={tr("發布為官方模板")}
                        title={tr("發布為官方模板")}
                        className={styles.iconButton}
                      >
                        <IconApps className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        requestDeletion({ kind: "workflow", id: w.id, name: w.name });
                      }}
                      aria-label={tr("刪除")}
                      className={styles.iconButton}
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* 官方模板 */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div><h2>{tr("官方模板")}{templates && <span className={styles.count}>{templates.length}</span>}</h2>
            <p>{tr("— 從一份構想，走向完整的作品")}</p></div>
          </div>
          {templates === null ? (
            <div className={styles.gallery} aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={styles.skeleton} />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <p className={styles.empty}>{tr("目前還沒有官方模板")}</p>
          ) : (
            <div className={styles.gallery}>
              {templates.map((t) => (
                <GalleryCard
                  key={t.id}
                  cover={t.cover}
                  previewVideo={t.previewVideo}
                  previewImages={t.previewImages}
                  previewHref={t.id < 0 ? `/canvas/templates/${t.id}` : undefined}
                  icon={<IconApps className="h-4 w-4" />}
                  title={tr(t.name)}
                  subtitle={tr(t.description) || tr("{n} 個節點", { n: t.nodeCount })}
                  badge={tr("{n} 個節點", { n: t.nodeCount })}
                  onOpen={() => cloneTemplate(t.id)}
                  onOpenLabel={busyId === `t${t.id}` ? tr("複製中…") : tr("複製到我的畫布")}
                  busy={busyId !== null}
                  corner={
                    isAdmin && t.id > 0 ? (
                      <button
                        type="button"
                        onClick={() => requestDeletion({ kind: "template", id: t.id, name: tr(t.name) })}
                        aria-label={tr("刪除範本")}
                        className={styles.iconButton}
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
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div><h2>{tr("藍翼廣場")}{plaza && <span className={styles.count}>{plaza.length}</span>}</h2>
            <p>{tr("— 大家分享出來的工作流，歡迎拿去用")}</p></div>
            <button type="button" onClick={() => setShareId("")} className={styles.secondary}><IconPlus className="h-4 w-4" />{tr("＋ 上傳工作流").replace(/^＋\s*/, "")}</button>
          </div>
          {plaza === null ? (
            <div className={styles.gallery} aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={styles.skeleton} />
              ))}
            </div>
          ) : plaza.length === 0 ? (
            <p className={styles.empty}>{tr("還沒有人分享工作流，來當第一個吧")}</p>
          ) : (
            <div className={styles.gallery}>
              {plaza.map((p) => (
                <GalleryCard
                  key={p.id}
                  icon={<IconGlobe className="h-4 w-4" />}
                  title={tr(p.name)}
                  subtitle={p.description || `by ${p.authorName}`}
                  badge={tr("by {author} · 複製 {n} 次", { author: p.authorName, n: p.copyCount })}
                  onOpen={() => clonePlazaPost(p.id)}
                  onOpenLabel={busyId === `p${p.id}` ? tr("複製中…") : tr("複製到我的畫布")}
                  busy={busyId !== null}
                  corner={
                    p.isOwn || isAdmin ? (
                      <button
                        type="button"
                        onClick={() => requestDeletion({ kind: "plaza", id: p.id, name: p.name })}
                        aria-label={tr("刪除分享")}
                        className={styles.iconButton}
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
      {deletion && <div className={styles.dialogBackdrop} onKeyDown={event => { if (event.key === "Escape" && !deleting) setDeletion(null); }}>
        <section ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="canvas-delete-title" aria-describedby="canvas-delete-note" className={styles.dialog}>
          <h2 id="canvas-delete-title">{copy.deleteTitle}</h2>
          <p className={styles.deleteName}>{deletion.name}</p>
          <p id="canvas-delete-note">{copy.deleteNote}</p>
          {deleteError && <p role="alert" className={styles.error}>{deleteError}</p>}
          <div className={styles.dialogActions}><button type="button" autoFocus className={styles.secondary} onClick={() => setDeletion(null)} disabled={deleting}>{tr("取消")}</button><button type="button" className={styles.danger} onClick={() => void remove()} disabled={deleting}>{deleting ? copy.deleting : tr("刪除")}</button></div>
        </section>
      </div>}
    </div>
  );
}
