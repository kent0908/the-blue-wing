"use client";

import { useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n/client";
import { speechUnits, spokenText } from "@/lib/speechText";

/**
 * Read-aloud control on one companion reply.
 *
 * Generating costs credits, replaying does not — so the button states are
 * deliberately different: an un-generated reply shows its price up front
 * ("朗讀 · 3 點") and never starts on its own, while one that already has
 * audio is a plain play/pause. The parent owns the cache map so a reply
 * generated once stays free for the rest of the session, and only one
 * clip plays at a time (a second tap stops the first).
 */
export default function MessageSpeech({
  characterId,
  messageId,
  content,
  url,
  onGenerated,
  onError,
  autoPlay,
}: {
  characterId: number;
  messageId: string;
  content: string;
  url: string | null;
  onGenerated: (messageId: string, url: string, credits: number) => void;
  onError: (message: string) => void;
  /** set once, by the parent, for a freshly arrived reply when 自動朗讀 is on */
  autoPlay?: boolean;
}) {
  const tr = useTr();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const started = useRef(false);

  const text = spokenText(content);
  const cost = speechUnits(text);

  useEffect(() => {
    const current = audio;
    return () => { current.current?.pause(); };
  }, []);

  // A fresh element per play, never a mutated one: the previous clip is
  // paused first so only one reply is ever speaking on the page.
  const play = (src: string) => {
    document.querySelectorAll("audio[data-bw-speech]").forEach((el) => (el as HTMLAudioElement).pause());
    const el = new Audio(src);
    el.setAttribute("data-bw-speech", "1");
    el.addEventListener("play", () => setPlaying(true));
    el.addEventListener("pause", () => setPlaying(false));
    el.addEventListener("ended", () => setPlaying(false));
    el.addEventListener("error", () => { setPlaying(false); onError(tr("語音無法播放")); });
    audio.current = el;
    void el.play().catch(() => onError(tr("語音無法播放")));
  };

  const speak = async () => {
    if (busy) return;
    if (playing) { audio.current?.pause(); return; }
    if (url) { play(url); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/characters/${characterId}/messages/${messageId}/speech`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || tr("語音生成失敗"));
      onGenerated(messageId, json.url, json.credits ?? 0);
      play(json.url);
    } catch (e) {
      onError(e instanceof Error ? e.message : tr("語音生成失敗"));
    } finally {
      setBusy(false);
    }
  };

  // Auto-read is opt-in and applies only to a reply that just arrived; it
  // never re-reads history, and it never fires twice for the same bubble.
  useEffect(() => {
    if (!autoPlay || started.current || !text) return;
    started.current = true;
    void speak();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per arriving reply
  }, [autoPlay]);

  if (!text) return null;

  return (
    <button
      type="button"
      onClick={speak}
      disabled={busy}
      aria-label={url ? (playing ? tr("暫停朗讀") : tr("播放朗讀")) : cost === 1 ? tr("朗讀這則，花費 1 點") : tr("朗讀這則，花費 {n} 點", { n: cost })}
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-[#8fb9ae] transition-colors hover:border-white/25 hover:text-[#b7f5e1] disabled:opacity-50"
    >
      <span aria-hidden="true">{busy ? "…" : playing ? "❚❚" : "▶"}</span>
      {/* a one-credit reading is the common case for a short reply, so it gets its own string rather than reading "1 credits" */}
      <span>{url ? (playing ? tr("暫停") : tr("播放")) : busy ? tr("生成中…") : cost === 1 ? tr("朗讀 · 1 點") : tr("朗讀 · {n} 點", { n: cost })}</span>
    </button>
  );
}
