"use client";

import { useState } from "react";
import { IconTrash } from "../Icons";
import type { EditorLayer } from "@/lib/layerEditor";

/**
 * The layer stack (top of the list = front of the canvas). Click selects,
 * double-click renames, and each row has visibility / lock / order /
 * duplicate / delete. Drag-to-reorder is done with plain HTML5 drag events
 * on the rows.
 */
export default function LayerList({
  layers,
  selectedId,
  onSelect,
  onPatch,
  onMove,
  onReorder,
  onDuplicate,
  onRemove,
}: {
  layers: EditorLayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<EditorLayer>, snapshot?: boolean) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onReorder: (id: string, beforeId: string | null) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      {[...layers].reverse().map((l) => (
        <div
          key={l.id}
          draggable
          onDragStart={() => setDragId(l.id)}
          onDragOver={(e) => {
            e.preventDefault();
            setOverId(l.id);
          }}
          onDragLeave={() => setOverId(null)}
          onDrop={(e) => {
            e.preventDefault();
            if (dragId && dragId !== l.id) onReorder(dragId, l.id);
            setDragId(null);
            setOverId(null);
          }}
          onDragEnd={() => {
            setDragId(null);
            setOverId(null);
          }}
          onClick={() => onSelect(l.id)}
          onDoubleClick={() => setRenaming(l.id)}
          className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] ${
            l.id === selectedId ? "bg-[#1f1f1f] text-white" : "text-[#9a9a9a] hover:bg-[#161616]"
          } ${overId === l.id && dragId !== l.id ? "ring-1 ring-[#7ff0cd]" : ""} ${l.visible ? "" : "opacity-60"}`}
        >
          {l.kind === "text" ? (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-[#2a2a2a] text-[10px] font-semibold text-[#c9c9c9]">T</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.src} alt="" className="h-6 w-6 shrink-0 rounded object-cover" style={{ transform: `scale(${l.flipX ? -1 : 1}, ${l.flipY ? -1 : 1})` }} />
          )}
          {renaming === l.id ? (
            <input
              autoFocus
              defaultValue={l.name}
              maxLength={60}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                onPatch(l.id, { name: e.target.value.trim() || l.name }, true);
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setRenaming(null);
              }}
              className="min-w-0 flex-1 rounded border border-[#3a3a3a] bg-[#111] px-1 text-[11px] text-white focus:outline-none"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate" title={`${l.name}（雙擊改名）`}>
              {l.name}
            </span>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); onPatch(l.id, { visible: !l.visible }, true); }} className="text-[10px] text-[#6d6d6d] hover:text-white" title="顯示/隱藏">
            {l.visible ? "👁" : "🚫"}
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onPatch(l.id, { locked: !l.locked }, true); }} className={`text-[10px] hover:text-white ${l.locked ? "text-[#f0c27f]" : "text-[#6d6d6d]"}`} title={l.locked ? "解除鎖定" : "鎖定（防止誤拖）"}>
            {l.locked ? "🔒" : "🔓"}
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onMove(l.id, 1); }} className="text-[#6d6d6d] hover:text-white" title="上移一層">↑</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onMove(l.id, -1); }} className="text-[#6d6d6d] hover:text-white" title="下移一層">↓</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicate(l.id); }} className="text-[10px] text-[#6d6d6d] hover:text-white" title="複製圖層（Ctrl+D）">⧉</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(l.id); }} className="text-[#6d6d6d] hover:text-[#ff8a8a]" title="刪除（Delete）">
            <IconTrash className="h-3 w-3" />
          </button>
        </div>
      ))}
      {layers.length === 0 && <p className="px-1 py-3 text-center text-[10.5px] text-[#5c5c5c]">還沒有圖層，先上傳或從資產庫選一張</p>}
    </div>
  );
}
