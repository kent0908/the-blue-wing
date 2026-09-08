"use client";

import { useEffect, useRef, useState } from "react";
import { IconChat, IconClose, IconArrowRight, IconDiscord } from "./Icons";
import { FAQ_CATEGORIES } from "@/lib/supportFaq";

type Action = { type: "root" } | { type: "category"; id: string } | { type: "question"; categoryId: string; qIndex: number };

interface Option {
  label: string;
  action: Action;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  /** Clickable follow-up chips attached to an assistant message — the QA
   *  browsing part (lib/supportFaq.ts's FAQ_CATEGORIES) is answered
   *  instantly client-side, no network call. Free-typed text still goes to
   *  /api/support-chat as before. */
  options?: Option[];
}

const rootOptions: Option[] = FAQ_CATEGORIES.map((c) => ({ label: c.label, action: { type: "category", id: c.id } }));

const GREETING: Msg = {
  role: "assistant",
  content: "嗨！我是 The Blue Wing 客服助手。挑一個類別看常見問題，或直接在下面打字問我。",
  options: rootOptions,
};

function categoryOf(id: string) {
  return FAQ_CATEGORIES.find((c) => c.id === id);
}

export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, open]);

  const pickOption = (opt: Option) => {
    const userMsg: Msg = { role: "user", content: opt.label };

    if (opt.action.type === "root") {
      setMsgs((cur) => [...cur, userMsg, { role: "assistant", content: "回到主選單，想看哪個類別？", options: rootOptions }]);
      return;
    }

    if (opt.action.type === "category") {
      const cat = categoryOf(opt.action.id);
      if (!cat) return;
      const options: Option[] = [
        ...cat.entries.map((e, i) => ({ label: e.question, action: { type: "question" as const, categoryId: cat.id, qIndex: i } })),
        { label: "← 返回主選單", action: { type: "root" } },
      ];
      setMsgs((cur) => [...cur, userMsg, { role: "assistant", content: `「${cat.label}」常見問題：`, options }]);
      return;
    }

    // question
    const cat = categoryOf(opt.action.categoryId);
    const entry = cat?.entries[opt.action.qIndex];
    if (!cat || !entry) return;
    const followUps: Option[] = [
      { label: `← 「${cat.label}」其他問題`, action: { type: "category", id: cat.id } },
      { label: "← 返回主選單", action: { type: "root" } },
    ];
    setMsgs((cur) => [...cur, userMsg, { role: "assistant", content: entry.answer, options: followUps }]);
  };

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
        // Only plain role/content — options are a client-only affordance,
        // and mixing in the pre-scripted QA turns would just pad tokens for
        // no benefit (the LLM already gets the same bank via its own system
        // prompt).
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
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
    <div className="fixed bottom-5 right-5 z-50 flex h-[520px] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#111] shadow-2xl">
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
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex flex-col items-start gap-1.5"}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed ${
                m.role === "user" ? "bg-[#2a2a2a] text-white" : "bg-[#1a1a1a] text-[#d8d8d8]"
              }`}
            >
              {m.content}
            </div>
            {m.options && (
              <div className="flex flex-wrap gap-1.5">
                {m.options.map((opt, oi) => (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => pickOption(opt)}
                    className="rounded-full border border-[#2c2c2c] bg-[#161616] px-2.5 py-1 text-[11.5px] text-[#c9c9c9] transition-colors hover:border-[#4a4a4a] hover:text-white"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="text-[11.5px] text-[#6d6d6d]">輸入中…</div>}
      </div>

      <div className="flex items-center gap-2 border-t border-[#1e1e1e] p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="上面找不到答案？打字問我…"
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
