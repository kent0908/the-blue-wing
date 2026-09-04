"use client";

import { useState } from "react";

/**
 * Older generations may have been recorded with a signed upstream URL that's
 * since expired (fixed going forward — see lib/mediaStore.ts — but nothing
 * can recover bytes behind an already-dead link). Rather than the browser's
 * raw broken-image icon, show a small "已過期" tile so it reads as an
 * expected, explained state rather than a rendering bug. Used by both the
 * 生成紀錄 thumbnails and the main viewer.
 */
export default function ExpiringMedia({
  kind,
  url,
  alt,
  className,
  fallbackClassName,
  controls,
  onBroken,
}: {
  kind: "image" | "video";
  url: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  /** show native video controls (the main viewer does; history thumbnails don't) */
  controls?: boolean;
  onBroken?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const fail = () => {
    setBroken(true);
    onBroken?.();
  };

  if (broken) {
    return (
      <div className={fallbackClassName ?? "flex aspect-square w-full flex-col items-center justify-center gap-1 bg-[#1c1c1c] text-[#6d6d6d]"}>
        <span className="text-[18px]">⚠</span>
        <span className="text-[10.5px]">已過期</span>
      </div>
    );
  }

  if (kind === "video") {
    return controls ? (
      <video src={url} controls className={className} onError={fail} />
    ) : (
      // not interactive here (history thumbnails) — click selects it into the main viewer instead
      <video src={url} className={className} preload="metadata" muted onError={fail} />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} onError={fail} />;
}
