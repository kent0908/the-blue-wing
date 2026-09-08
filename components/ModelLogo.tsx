"use client";

import { modelLogoFor } from "@/lib/modelLogo";
import { modelBadgeFor } from "@/lib/modelBadge";

/**
 * A model's brand mark, sized to `size` px.
 *
 * Monochrome white marks on black; the source alpha preserves the silhouette.
 * Unknown families retain a readable white letter on the same black chip.
 */
export default function ModelLogo({ id, size = 28, className = "" }: { id: string; size?: number; className?: string }) {
  const logo = modelLogoFor(id);
  const radius = Math.max(6, Math.round(size * 0.26));

  if (!logo) {
    const badge = modelBadgeFor(id);
    return (
      <span
        className={`grid shrink-0 place-items-center font-semibold ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: "#000",
          color: "#fff",
          fontSize: Math.round(size * 0.38),
        }}
      >
        {badge.letter}
      </span>
    );
  }

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden bg-black text-white ${className}`}
      style={{ width: size, height: size, borderRadius: radius, padding: Math.round(size * 0.14) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static pre-sized 128px asset in /public; next/image's pipeline buys nothing for a ~5KB icon rendered dozens of times in one list */}
      <img src={logo.src} alt={logo.label} className="h-full w-full object-contain brightness-0 invert" />
    </span>
  );
}
