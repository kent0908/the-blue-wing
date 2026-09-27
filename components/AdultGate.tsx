"use client";

import { useCallback, useEffect, useState } from "react";
import { useTr } from "@/lib/i18n/client";

/**
 * 18+ interstitial for the 陪聊 area, mounted from app/companions/layout.tsx
 * so it covers the shelf, the builder and every chat page.
 *
 * This is the courtesy half of the gate. The enforcement is
 * requireAdultUser() in lib/apiauth.ts, which every /api/characters route
 * uses — a user who never loads this component still cannot read or write a
 * single companion. So the component is free to fail open on a network error:
 * the worst case is the API answering 403 age_unverified a moment later.
 *
 * Signed-out visitors pass straight through. They have nothing to gate yet,
 * and the pages behind this already handle their own sign-in prompts; showing
 * a date-of-birth form to someone who has not logged in would only collect a
 * birthday we have nowhere to store.
 */
type State = "loading" | "open" | "gated" | "rejected";

export default function AdultGate({ children }: { children: React.ReactNode }) {
  const tr = useTr();
  const [state, setState] = useState<State>("loading");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/age", { cache: "no-store" });
        if (cancelled) return;
        // 401 = signed out: nothing to gate yet. Any other failure opens too;
        // the API is the real gate.
        if (!res.ok) return setState("open");
        const json = await res.json();
        setState(json?.verified ? "open" : "gated");
      } catch {
        if (!cancelled) setState("open");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !birthDate) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/account/age", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.verified) return setState("open");
      // An under-age answer is final for this visit — no retry field to nudge,
      // which would just teach the visitor which year to type instead.
      if (json?.error?.code === "under_age") return setState("rejected");
      setError(json?.error?.message || tr("確認失敗，請稍後再試。"));
    } catch {
      setError(tr("確認失敗，請稍後再試。"));
    } finally {
      setSaving(false);
    }
  }, [birthDate, saving, tr]);

  if (state === "loading") return null;
  if (state === "open") return <>{children}</>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-[#2a2a2a] bg-[#161616] p-6">
        <h1 className="text-lg font-semibold text-white">{tr("陪聊區限 18 歲以上")}</h1>
        {state === "rejected" ? (
          <p className="mt-3 text-sm leading-relaxed text-[#a0a0a0]">
            {tr("你填寫的出生日期未滿 18 歲，無法進入陪聊區。網站的其他功能不受影響。")}
          </p>
        ) : (
          <form onSubmit={submit} className="mt-3">
            <p className="text-sm leading-relaxed text-[#a0a0a0]">
              {tr("這個區域的角色互動包含成人向內容。請填寫你的出生日期，只需要確認一次。")}
            </p>
            <label className="mt-5 block text-sm text-[#d0d0d0]" htmlFor="bw-birth-date">
              {tr("出生日期")}
            </label>
            <input
              id="bw-birth-date"
              type="date"
              required
              max={today}
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="mt-2 w-full rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2 text-white outline-none focus:border-[#4a4a4a]"
            />
            {error ? <p className="mt-2 text-sm text-[#ff8080]">{error}</p> : null}
            <button
              type="submit"
              disabled={saving || !birthDate}
              className="mt-5 w-full rounded-xl bg-white px-4 py-2.5 font-medium text-black transition-opacity disabled:opacity-40"
            >
              {saving ? tr("確認中…") : tr("確認並進入")}
            </button>
            <p className="mt-4 text-xs leading-relaxed text-[#707070]">
              {tr("我們只用這個日期判斷是否滿 18 歲，不會公開顯示。")}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
