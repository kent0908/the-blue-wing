"use client";

import { modelLogoFor } from "@/lib/modelLogo";
import { modelBadgeFor } from "@/lib/modelBadge";

/**
 * A model's brand mark, sized to `size` px.
 *
 * Always on a light chip: two of the supplied logos (OpenAI's knot,
 * HappyHorse's horse) are solid black marks that all but vanish against this
 * app's dark surfaces — verified by compositing every logo both ways before
 * picking this. A light chip also means each mark keeps its own original
 * colours rather than being recoloured to suit the theme.
 *
 * Falls back to lib/modelBadge.ts's coloured letter for any model we have no
 * logo file for, so a newly-added model still renders something sensible.
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
          background: badge.bg,
          color: badge.fg,
          fontSize: Math.round(size * 0.38),
        }}
      >
        {badge.letter}
      </span>
    );
  }

  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden bg-white ${className}`}
      style={{ width: size, height: size, borderRadius: radius, padding: Math.round(size * 0.14) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static pre-sized 128px asset in /public; next/image's pipeline buys nothing for a ~5KB icon rendered dozens of times in one list */}
      <img src={logo.src} alt={logo.label} className="h-full w-full object-contain" />
    </span>
  );
}
