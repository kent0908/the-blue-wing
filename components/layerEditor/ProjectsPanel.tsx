"use client";

import { useState } from "react";
import { IconTrash } from "../Icons";

export interface ProjectSummary {
  id: number;
  name: string;
  layerCount: number;
  canvas: { width: number; height: number } | null;
  updatedAt: string;
}

export interface VersionSummary {
  id: number;
  label: string;
  layerCount: number;
  createdAt: string;
}

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "剛剛";
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  return `${Math.floor(s / 86400)} 天前`;
}

/**
 * 專案 + 版本 sidebar section for 圖層編輯 — projects autosave to the account
 * (see app/api/editor/projects); versions are snapshots the editor takes
 * around every AI step, plus manual ones from here.
 */
export default function ProjectsPanel({
  projects,
  currentId,
  currentName,
  saveState,
  versions,
  onOpen,
  onNew,
  onRename,
  onDelete,
  onSaveVersion,
  onRestoreVersion,
}: {
  projects: ProjectSummary[];
  currentId: number | null;
  currentName: string;
  saveState: "saved" | "saving" | "dirty" | "error" | "local";
  versions: VersionSummary[];
  onOpen: (id: number) => void;
  onNew: () => void;
  onRename: (name: string) => void;
  onDelete: (id: number) => void;
  onSaveVersion: (label: string) => void;
  onRestoreVersion: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const stateText = { saved: "已儲存", saving: "儲存中…", dirty: "未儲存", error: "儲存失敗", local: "未登入，只保存在本次" }[saveState];
  const stateColor = saveState === "error" ? "text-[#ff9b9b]" : saveState === "saved" ? "text-[#7ff0cd]" : "text-[#8a8a8a]";

  return (
    <div className="rounded-lg border border-[#222] bg-[#121212]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
        <span className="min-w-0 flex-1 truncate text-[12px] text-white">{currentName || "未命名專案"}</span>
        <span className={`text-[10px] ${stateColor}`}>{stateText}</span>
        <span className="text-[10px] text-[#6d6d6d]">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-[#1e1e1e] p-2">
          <input
            value={currentName}
            onChange={(e) => onRename(e.target.value)}
            placeholder="專案名稱"
            maxLength={80}
            className="w-full rounded-md border border-[#2c2c2c] bg-[#1c1c1c] px-2 py-1 text-[11.5px] text-white focus:border-[#4a4a4a] focus:outline-none"
          />
          <button type="button" onClick={onNew} className="w-full rounded-md bg-[#1f1f1f] px-2 py-1.5 text-[11.5px] text-[#c9c9c9] hover:bg-[#282828]">
            ＋ 新專案
          </button>
          <div className="max-h-[150px] space-y-0.5 overflow-y-auto">
            {projects.map((p) => (
              <div key={p.id} className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] ${p.id === currentId ? "bg-[#1f1f1f] text-white" : "text-[#9a9a9a] hover:bg-[#181818]"}`}>
                <button type="button" onClick={() => onOpen(p.id)} className="min-w-0 flex-1 truncate text-left" title={p.name}>
                  {p.name}
                  <span className="ml-1 text-[9.5px] text-[#6d6d6d]">
                    {p.layerCount} 層 · {ago(p.updatedAt)}
                  </span>
                </button>
                <button type="button" onClick={() => onDelete(p.id)} className="text-[#5c5c5c] hover:text-[#ff8a8a]" aria-label="刪除專案">
                  <IconTrash className="h-3 w-3" />
                </button>
              </div>
            ))}
            {projects.length === 0 && <p className="px-1 py-1 text-[10.5px] text-[#5c5c5c]">還沒有存過專案</p>}
          </div>

          <div className="border-t border-[#1e1e1e] pt-2">
            <div className="mb-1 text-[10.5px] text-[#8a8a8a]">版本歷史</div>
            <div className="flex gap-1">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="版本備註（選填）" maxLength={80} className="min-w-0 flex-1 rounded-md border border-[#2c2c2c] bg-[#1c1c1c] px-2 py-1 text-[11px] text-white focus:border-[#4a4a4a] focus:outline-none" />
              <button
                type="button"
                disabled={currentId === null}
                onClick={() => {
                  onSaveVersion(label.trim());
                  setLabel("");
                }}
                className="rounded-md bg-[#1f1f1f] px-2 py-1 text-[11px] text-[#c9c9c9] hover:bg-[#282828] disabled:opacity-40"
              >
                存版本
              </button>
            </div>
            <div className="mt-1 max-h-[150px] space-y-0.5 overflow-y-auto">
              {versions.map((v) => (
                <button key={v.id} type="button" onClick={() => onRestoreVersion(v.id)} className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] text-[#9a9a9a] hover:bg-[#181818] hover:text-white" title="回到這個版本（目前狀態會先存成一個版本）">
                  <span className="min-w-0 flex-1 truncate">{v.label || "版本"}</span>
                  <span className="text-[9.5px] text-[#6d6d6d]">
                    {v.layerCount} 層 · {ago(v.createdAt)}
                  </span>
                </button>
              ))}
              {versions.length === 0 && <p className="px-1 py-1 text-[10.5px] text-[#5c5c5c]">{currentId === null ? "登入後專案會自動存到帳號" : "每次 AI 生成／重繪都會自動留一個版本"}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
