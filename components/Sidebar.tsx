"use client";

import { getGenerationModes } from "@/lib/generationModes";
import { modelLabel } from "@/lib/modelLabel";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconHome,
  IconImage,
  IconVideo,
  IconAudio,
  IconChat,
  IconAvatar,
  IconCanvas,
  IconAssets,
  IconCollapse,
  IconWing,
  IconDiscord,
  IconX,
  IconInstagram,
} from "./Icons";
import ModelLogo from "./ModelLogo";

// 2026-09-08：社群連結，暫時都是 "#" 佔位——真正的邀請連結/帳號網址還沒拿到，
// 先把版面跟圖示排好，之後換成真的網址只需要改這裡三個值。
const SOCIAL_LINKS: { href: string; label: string; icon: (p: { className?: string }) => React.ReactElement }[] = [
  { href: "#", label: "Discord", icon: IconDiscord },
  { href: "#", label: "X", icon: IconX },
  { href: "#", label: "Instagram", icon: IconInstagram },
];

type Badge = { text: string; tone: "hot" | "new" };
type Item = {
  href: string;
  label: string;
  icon: (p: { className?: string }) => React.ReactElement;
  badge?: Badge;
  /** image/video modes only — shows a hover flyout of that modality's live model list (see ModelFlyout below). */
  modelModality?: "image" | "video";
};

const GROUP_A: Item[] = [
  { href: "/", label: "首頁", icon: IconHome },
  { href: "/studio?mode=image", label: "圖片生成", icon: IconImage, modelModality: "image" },
  { href: "/studio?mode=video", label: "影片生成", icon: IconVideo, badge: { text: "HOT", tone: "hot" }, modelModality: "video" },
  { href: "/studio?mode=audio", label: "文字創作", icon: IconAudio },
  { href: "/avatar", label: "數位人", icon: IconAvatar },
];

const GROUP_B: Item[] = [
  { href: "/canvas", label: "智慧畫布", icon: IconCanvas, badge: { text: "NEW", tone: "new" } },
  { href: "/canvas/director3d", label: "3D 導演台", icon: IconAvatar, badge: { text: "NEW", tone: "new" } },
  { href: "/editor", label: "圖層編輯", icon: IconImage, badge: { text: "NEW", tone: "new" } },
];

const GROUP_C: Item[] = [
  { href: "/assets", label: "資產庫", icon: IconAssets },
  { href: "/companions", label: "陪聊角色", icon: IconChat, badge: { text: "NEW", tone: "new" } },
];

function BadgeTag({ badge }: { badge: Badge }) {
  return (
    <span
      className="bw-badge shrink-0"
      style={{ color: badge.tone === "hot" ? "var(--bw-hot)" : "var(--bw-mint)" }}
    >
      {badge.text}
    </span>
  );
}

interface SidebarModel {
  id: string;
  displayName: string;
  modality: string;
}

interface FlyoutState {
  modality: "image" | "video";
  top: number;
  left: number;
}

/**
 * Hover flyout of a modality's live model list, shown next to the "圖片生成"
 * / "影片生成" sidebar rows — matching the reference the ask pointed at
 * (即夢/Lumina-style: hover the nav item, see every model with its own
 * icon, no need to click into the page first). Reuses the same per-family
 * colour badge as the Composer's own model picker (lib/modelBadge.ts) for a
 * consistent look between the two.
 *
 * Rendered through a portal into document.body at a `position: fixed`
 * screen coordinate, NOT as a plain absolutely-positioned child of the nav
 * row — the sidebar's <nav> has overflow-y-auto, which (per how overflow
 * clipping works) would otherwise clip anything extending past its right
 * edge no matter how the child itself is positioned, the exact bug already
 * fixed today in the Composer's 進階設定 popover. A portal is the only way
 * out of an ancestor's overflow clip that doesn't involve restructuring the
 * whole sidebar layout.
 */
function ModelFlyoutPortal({
  state,
  models,
  onMouseEnter,
  onMouseLeave,
}: {
  state: FlyoutState;
  models: SidebarModel[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const [sub, setSub] = useState<{ id: string; top: number } | null>(null);
  const list = models.filter((m) => m.modality === state.modality && !/nsfw/i.test(m.id));
  return createPortal(
    <>
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="bw-menu fixed z-50 max-h-[70vh] w-[240px] overflow-y-auto p-1.5"
      style={{ top: state.top, left: state.left }}
    >
      <div className="px-2 pb-1.5 pt-1 text-[11px] text-[#8a8a8a]">模型</div>
      {list.length === 0 && <div className="px-2 py-3 text-center text-[11px] text-[#6d6d6d]">載入中…</div>}
      {list.map((m) => {
        return (
          <Link onMouseEnter={(e) => setSub({id:m.id,top:Math.min(e.currentTarget.getBoundingClientRect().top,window.innerHeight-300)})} onFocus={(e) => setSub({id:m.id,top:Math.min(e.currentTarget.getBoundingClientRect().top,window.innerHeight-300)})} key={m.id} href={`/studio?mode=${state.modality}&model=${encodeURIComponent(m.id)}`} className="bw-menu-item"
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              window.dispatchEvent(new CustomEvent("bluewing:model-select", { detail: { mode: state.modality, model: m.id } }));
            }}>
            <ModelLogo id={m.id} size={28} />
            <span className="min-w-0 flex-1 truncate text-[13px]">{modelLabel(m.displayName)}</span><span aria-hidden="true">›</span>
          </Link>
        );
      })}
    </div>
    {sub && getGenerationModes(sub.id,state.modality).length>0 && <div aria-label="模型功能" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className="bw-menu fixed z-[60] w-[210px] p-1.5" style={{top:Math.max(8,sub.top),left:Math.min(state.left+238,window.innerWidth-218)}}>
      {getGenerationModes(sub.id,state.modality).map(item => item.enabled ? <Link key={item.id} className="bw-menu-item" href={`/studio?mode=${state.modality}&model=${encodeURIComponent(sub.id)}&operation=${item.id}`} onClick={() => window.dispatchEvent(new CustomEvent("bluewing:model-select",{detail:{mode:state.modality,model:sub.id,operation:item.id}}))}>{item.label}</Link> : <div key={item.id} className="px-3 py-2 text-xs text-[#777]" aria-disabled="true">{item.label}<p className="mt-1 text-[10px] leading-4">{item.reason}</p></div>)}
    </div>}
    </>,
    document.body
  );
}

function NavLink({
  item,
  active,
  collapsed,
  onFlyoutEnter,
  onFlyoutLeave,
}: {
  item: Item;
  active: boolean;
  collapsed: boolean;
  onFlyoutEnter?: (modality: "image" | "video", el: HTMLElement) => void;
  onFlyoutLeave?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      onMouseEnter={item.modelModality ? (e) => onFlyoutEnter?.(item.modelModality!, e.currentTarget) : undefined}
      onMouseLeave={item.modelModality ? onFlyoutLeave : undefined}
      className={[
        "flex items-center gap-3 rounded-lg py-2 text-[13.5px] transition-colors",
        collapsed ? "justify-center px-0" : "px-3",
        active ? "bg-[#1c1c1c] text-white" : "text-[#c9c9c9] hover:bg-[#161616] hover:text-white",
      ].join(" ")}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          {item.badge && <BadgeTag badge={item.badge} />}
        </>
      )}
    </Link>
  );
}

function SidebarInner() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const mode = params.get("mode") ?? "video";

  const [models, setModels] = useState<SidebarModel[]>([]);
  useEffect(() => {
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((j: { models?: { id: string; displayName?: string; modality: string }[] }) =>
        setModels((j.models ?? []).map((m) => ({ id: m.id, displayName: m.displayName || m.id, modality: m.modality })))
      )
      .catch(() => {});
  }, []);

  // Only one flyout open at a time; a short close delay lets the mouse
  // travel from the nav row into the (portaled, so not visually adjacent in
  // the DOM) flyout without it disappearing first.
  const [flyout, setFlyout] = useState<FlyoutState | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setFlyout(null), 150);
  };
  const openFlyout = (modality: "image" | "video", el: HTMLElement) => {
    cancelClose();
    const rect = el.getBoundingClientRect();
    setFlyout({ modality, top: rect.top, left: rect.right + 8 });
  };

  const isActive = (href: string) => {
    const [path, query] = href.split("?");
    if (path !== pathname) return false;
    if (!query) return true;
    return query === `mode=${mode}`;
  };

  const w = collapsed ? "w-[64px]" : "w-[212px]";

  return (
    <aside className={`${w} flex h-full shrink-0 flex-col bg-black transition-[width] duration-200`}>
      <div className={`flex h-14 items-center ${collapsed ? "justify-center" : "gap-2.5 pl-4"}`}>
        <IconWing className="h-9 w-auto shrink-0" />
        {!collapsed && (
          <span className="whitespace-nowrap text-[17px] font-semibold tracking-tight">The Blue Wing</span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-2">
        <div className="space-y-0.5">
          {GROUP_A.map((i) => (
            <NavLink key={i.href} item={i} active={isActive(i.href)} collapsed={collapsed} onFlyoutEnter={openFlyout} onFlyoutLeave={scheduleClose} />
          ))}
        </div>

        <div className="my-3 border-t border-[#1e1e1e]" />

        <div className="space-y-0.5">
          {GROUP_B.map((i) => (
            <NavLink key={i.href} item={i} active={isActive(i.href)} collapsed={collapsed} />
          ))}
        </div>

        <div className="my-3 border-t border-[#1e1e1e]" />

        <div className="space-y-0.5">
          {GROUP_C.map((i) => (
            <NavLink key={i.href} item={i} active={isActive(i.href)} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      <div className="px-3 pb-4">
        <NavLink item={{ href: "/landing", label: "返回啟程", icon: IconWing }} active={isActive("/landing")} collapsed={collapsed} />
        {!collapsed && (
          <div className="mb-2 flex items-center gap-1.5 border-t border-[#1e1e1e] px-1 pt-3">
            {SOCIAL_LINKS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                aria-label={s.label}
                title={s.label}
                className="grid h-8 w-8 place-items-center rounded-lg text-[#8a8a8a] transition-colors hover:bg-[#161616] hover:text-white"
              >
                <s.icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        )}

        <button
          onClick={() => setCollapsed((v) => !v)}
          className={[
            "mt-0.5 flex w-full items-center gap-3 rounded-lg py-2 text-[13.5px] text-[#c9c9c9] transition-colors hover:bg-[#161616] hover:text-white",
            collapsed ? "justify-center px-0" : "px-3",
          ].join(" ")}
        >
          <IconCollapse className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>收起</span>}
        </button>


      </div>

      {flyout && <ModelFlyoutPortal state={flyout} models={models} onMouseEnter={cancelClose} onMouseLeave={scheduleClose} />}
    </aside>
  );
}

export default function Sidebar() {
  return (
    <Suspense fallback={<div className="w-[212px] shrink-0 bg-black" />}>
      <SidebarInner />
    </Suspense>
  );
}

