"use client";

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
    <div className="flex min-h-full items-center justify-center px-6 py-16">
      <div className="w-full max-w-[380px] rounded-2xl border border-[#262626] bg-[#141414] p-7">
        <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
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
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-[#a8a8a8]">{label}</span>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-[#2c2c2c] bg-[#1c1c1c] px-3 text-[13.5px] text-white focus:border-[#4a4a4a] focus:outline-none"
      />
      {hint && <span className="mt-1 block text-[11px] text-[#6d6d6d]">{hint}</span>}
    </label>
  );
}

export function SubmitButton({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="mt-1 h-10 w-full rounded-lg bg-gradient-to-r from-[#7ff0cd] to-[#4fd1c5] text-[13.5px] font-medium text-[#0a1a16] transition-[filter] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? "處理中…" : children}
    </button>
  );
}
