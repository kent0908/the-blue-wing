"use client";

import { useEffect, useRef, useState } from "react";
import { IconChat, IconClose, IconArrowRight, IconDiscord } from "./Icons";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const GREETING: Msg = {
  role: "assistant",
  content: "嗨！我是 The Blue Wing 客服助手，方案、點數、模型、怎麼生成都可以問我。",
};

export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...msgs, { role: "user" as const, content: text }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => m !== GREETING) }),
      });
      const j = await res.json().catch(() => ({}));
      setMsgs((cur) => [
        ...cur,
        { role: "assistant", content: j.reply || j?.error?.message || "抱歉，我現在無法回答，請稍後再試。" },
      ]);
    } catch {
      setMsgs((cur) => [...cur, { role: "assistant", content: "連線失敗，請稍後再試。" }]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="客服"
        className="fixed bottom-5 right-5 z-50 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#7ff0cd] to-[#4fd1c5] text-[#0a1a16] shadow-lg transition-transform hover:scale-105"
      >
        <IconChat className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[480px] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#111] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[#1e1e1e] px-4 py-3">
        <div>
          <div className="text-[13.5px] font-semibold text-white">客服助手</div>
          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[#8a8a8a]">
            <a href="#" className="flex items-center gap-1 hover:text-white"><IconDiscord className="h-3.5 w-3.5" /> Discord</a>
            <a href="mailto:support@thebluewing.app" className="hover:text-white">Email</a>
          </div>
        </div>
        <button onClick={() => setOpen(false)} aria-label="關閉" className="text-[#8a8a8a] hover:text-white">
          <IconClose className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed ${
                m.role === "user" ? "bg-[#2a2a2a] text-white" : "bg-[#1a1a1a] text-[#d8d8d8]"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div className="text-[11.5px] text-[#6d6d6d]">輸入中…</div>}
      </div>

      <div className="flex items-center gap-2 border-t border-[#1e1e1e] p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="輸入問題…"
          maxLength={1000}
          className="h-9 min-w-0 flex-1 rounded-full border border-[#2c2c2c] bg-[#1c1c1c] px-3.5 text-[12.5px] text-white placeholder:text-[#6d6d6d] focus:border-[#4a4a4a] focus:outline-none"
        />
        <button
          onClick={send}
          disabled={!input.trim() || busy}
          aria-label="送出"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#7ff0cd] to-[#4fd1c5] text-[#0a1a16] disabled:opacity-40"
        >
          <IconArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
