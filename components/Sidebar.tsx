"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
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

type Badge = { text: string; tone: "hot" | "new" };
type Item = {
  href: string;
  label: string;
  icon: (p: { className?: string }) => React.ReactElement;
  badge?: Badge;
};

const GROUP_A: Item[] = [
  { href: "/", label: "首頁", icon: IconHome },
  { href: "/studio?mode=image", label: "圖片生成", icon: IconImage },
  { href: "/studio?mode=video", label: "影片生成", icon: IconVideo, badge: { text: "HOT", tone: "hot" } },
  { href: "/studio?mode=audio", label: "文字創作", icon: IconAudio },
  { href: "/avatar", label: "數位人", icon: IconAvatar },
];

const GROUP_B: Item[] = [
  { href: "/canvas", label: "智慧畫布", icon: IconCanvas, badge: { text: "NEW", tone: "new" } },
  { href: "/canvas/director3d", label: "3D 導演台", icon: IconAvatar, badge: { text: "NEW", tone: "new" } },
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

function NavLink({ item, active, collapsed }: { item: Item; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
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
            <NavLink key={i.href} item={i} active={isActive(i.href)} collapsed={collapsed} />
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

