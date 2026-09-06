"use client";

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
} from "./Icons";
import { modelBadgeFor } from "@/lib/modelBadge";

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
  const list = models.filter((m) => m.modality === state.modality);
  return createPortal(
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="bw-menu fixed z-50 max-h-[70vh] w-[240px] overflow-y-auto p-1.5"
      style={{ top: state.top, left: state.left }}
    >
      <div className="px-2 pb-1.5 pt-1 text-[11px] text-[#8a8a8a]">模型</div>
      {list.length === 0 && <div className="px-2 py-3 text-center text-[11px] text-[#6d6d6d]">載入中…</div>}
      {list.map((m) => {
        const badge = modelBadgeFor(m.id);
        return (
          <Link key={m.id} href={`/studio?mode=${state.modality}&model=${encodeURIComponent(m.id)}`} className="bw-menu-item">
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10.5px] font-semibold"
              style={{ background: badge.bg, color: badge.fg }}
            >
              {badge.letter}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px]">{m.displayName}</span>
          </Link>
        );
      })}
    </div>,
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

