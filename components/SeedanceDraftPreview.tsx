"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/client";
import { draftLibraryCopy } from "@/lib/i18n/draftLibrary";

export default function SeedanceDraftPreview({ draftEnabled, onDraftChange, draftCredits, finalCredits }: {
  draftEnabled: boolean;
  onDraftChange: (enabled: boolean) => void;
  draftCredits: number | null;
  finalCredits: number | null;
}) {
  const locale = useLocale();
  const copy = draftLibraryCopy(locale);
  const points = (value: number | null) => value === null ? copy.rateUnavailable : `${value.toLocaleString(locale)} ${copy.points}`;
  return (
    <section aria-label={copy.workflow} className="mx-3 mt-2 shrink-0 border-t border-white/10 pt-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div role="radiogroup" aria-label={copy.outputMode} className="flex max-w-full items-center rounded-full border border-white/10 bg-[#0c1416] p-0.5" onKeyDown={event => {
          if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
            event.preventDefault();
            event.currentTarget.querySelector<HTMLButtonElement>('button[aria-checked="false"]')?.focus();
            onDraftChange(!draftEnabled);
          }
        }}>
          {[false, true].map(enabled => <button key={String(enabled)} type="button" role="radio" tabIndex={draftEnabled === enabled ? 0 : -1} aria-checked={draftEnabled === enabled} onClick={() => onDraftChange(enabled)} className={`min-h-10 rounded-full px-3 py-1.5 transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#85e1dc] ${draftEnabled === enabled ? "bg-[#bbe4dc] text-[#142b2b]" : "text-[#9aafae] hover:text-white"}`}>{enabled ? copy.draftMode : copy.directMode}</button>)}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[#b6cbc9]">
          <Link href="/seedance-draft" className="min-h-8 content-center hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2">{copy.seeDifference} ↗</Link>
          <Link href="/drafts" className="min-h-8 content-center hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2">{copy.library} ↗</Link>
        </div>
      </div>
      {draftEnabled ? <p className="mt-2 pb-1 leading-5 text-[#9fb3b1] [text-wrap:pretty]">{copy.draftQuote} <span className="text-[#dcece8]">{points(draftCredits)}</span><span aria-hidden="true"> · </span>{copy.finalQuote} <span className="text-[#dcece8]">{points(finalCredits)}</span><span aria-hidden="true"> · </span>{copy.separateChargesShort}</p> : null}
    </section>
  );
}
