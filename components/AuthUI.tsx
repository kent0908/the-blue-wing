"use client";
import { useT } from "@/lib/i18n/client";
import { useId } from "react";

/** Shared chrome for /login, /register and /verify. */

export function AuthShell({
  title,
  children,
  foot,
}: {
  title: string;
  children: React.ReactNode;
  foot?: React.ReactNode;
}) {
  return (
    <div className="flex h-full items-start justify-center overflow-y-auto bg-[#111315] px-5 py-10 sm:py-16">
      <div className="w-full max-w-[420px] rounded-xl border border-[#343a42] bg-[#191c20] p-7 sm:p-8">
        <p className="mb-6 text-xs tracking-[.12em] text-[#adb4be]">THE BLUE WING</p>
        <h1 className="text-[24px] font-medium tracking-tight">{title}</h1>
        <div className="mt-5">{children}</div>
        {foot && <p className="mt-5 text-center text-[12.5px] text-[#8a8a8a]">{foot}</p>}
      </div>
    </div>
  );
}

export function Field({
  label,
  type = "text",
  value,
  onChange,
  autoFocus,
  hint,
  autoComplete,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  hint?: string;
  autoComplete?: string;
}) {
  const id = useId();
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-[#a8a8a8]">{label}</span>
      <input
        type={type}
        autoComplete={autoComplete ?? (type === "email" ? "email" : type === "password" ? "current-password" : undefined)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-[#434b56] bg-[#121518] px-3 text-[14px] text-white focus:border-[#8ab8ed] focus:outline-2 focus:outline-offset-2 focus:outline-[#8ab8ed]"
      />
      {hint && <span id={`${id}-hint`} className="mt-2 block text-[12px] text-[#adb4be]">{hint}</span>}
    </label>
  );
}

export function SubmitButton({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: React.ReactNode }) {
  const t = useT();
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="mt-3 min-h-11 w-full rounded-lg bg-[#edf0f3] text-[14px] font-medium text-[#15191e] transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? t.auth.busy : children}
    </button>
  );
}
