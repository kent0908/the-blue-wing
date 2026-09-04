/* Minimal inline icon set — no external icon dependency. */
type P = { className?: string };
const s = (p: P) => p.className ?? "w-[18px] h-[18px]";
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const;

export const IconHome = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <path d="M3.5 10.5 12 3.5l8.5 7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5.8 9.6V20h12.4V9.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconImage = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <rect x="3" y="4.5" width="15" height="15" rx="3" />
    <circle cx="8.4" cy="9.6" r="1.3" />
    <path d="m4 16.5 4.4-3.8 3.6 3.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19.5 3.5 20.4 6l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9z" strokeLinejoin="round" />
  </svg>
);

export const IconVideo = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <rect x="2.5" y="5.5" width="14" height="13" rx="3" />
    <path d="M9 9.6v4.8l4-2.4z" strokeLinejoin="round" />
    <path d="M19.5 3.5 20.4 6l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9z" strokeLinejoin="round" />
  </svg>
);

export const IconAgent = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <rect x="4" y="8" width="16" height="11" rx="3" />
    <path d="M12 4.2V8M8.8 12.6v1.6M15.2 12.6v1.6" strokeLinecap="round" />
    <circle cx="12" cy="3.4" r="1.2" />
  </svg>
);

export const IconAudio = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <rect x="2.5" y="5.5" width="14" height="13" rx="3" />
    <path d="M7 14V10M10 15.4V8.6M13 13V11" strokeLinecap="round" />
    <path d="M19.5 3.5 20.4 6l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9z" strokeLinejoin="round" />
  </svg>
);

export const IconChat = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9.2L5 19.6V16h-.5A.5.5 0 0 1 4 15.5z" strokeLinejoin="round" />
  </svg>
);

export const IconAvatar = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <rect x="3" y="4.5" width="18" height="15" rx="3" />
    <circle cx="11" cy="10.5" r="2.4" />
    <path d="M7 16.6c.9-1.7 2.4-2.5 4-2.5s3.1.8 4 2.5" strokeLinecap="round" />
  </svg>
);

export const IconApps = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <circle cx="6.5" cy="6.5" r="2.6" />
    <circle cx="6.5" cy="17.5" r="2.6" />
    <rect x="13.4" y="3.9" width="6.7" height="5.2" rx="1.6" />
    <rect x="13.4" y="14.9" width="6.7" height="5.2" rx="1.6" />
  </svg>
);

export const IconCanvas = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <path d="M4 8.5h16M4 15.5h16M8.5 4v16M15.5 4v16" strokeLinecap="round" />
  </svg>
);

export const IconAssets = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.1l1.8 2.2h8.1A2.5 2.5 0 0 1 21 9.7v7.8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" strokeLinejoin="round" />
  </svg>
);

export const IconAffiliate = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <circle cx="8" cy="8" r="3" />
    <circle cx="16.5" cy="16.5" r="3" />
    <path d="M10.4 10.4 14 14" strokeLinecap="round" />
  </svg>
);

export const IconCollapse = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="M9.5 4.5v15" />
  </svg>
);

export const IconHelp = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.5" strokeLinecap="round" />
    <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export const IconGlobe = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3.2 9.6h17.6M3.2 14.4h17.6" />
    <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" />
  </svg>
);

export const IconGift = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <rect x="3.5" y="9" width="17" height="11" rx="2" />
    <path d="M2.5 9h19v3.2h-19zM12 9v11" />
    <path d="M12 9S10.8 4.6 8.6 4.6a2 2 0 0 0 0 4.4M12 9s1.2-4.4 3.4-4.4a2 2 0 0 1 0 4.4" strokeLinejoin="round" />
  </svg>
);

export const IconSettings = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <path d="M4 8h9M17.5 8H20M4 16h3M11.5 16H20" strokeLinecap="round" />
    <circle cx="15.2" cy="8" r="2.2" />
    <circle cx="9.2" cy="16" r="2.2" />
  </svg>
);

export const IconExpand = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconChevronDown = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2} className={s(p)}>
    <path d="m6 9.5 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconChevronLeft = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2} className={s(p)}>
    <path d="m14.5 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconChevronRight = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2} className={s(p)}>
    <path d="m9.5 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconArrowRight = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} strokeWidth={1.8} className={s(p)}>
    <path d="M5 12h13m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconSearch = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" strokeLinecap="round" />
  </svg>
);

export const IconHistory = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" strokeLinecap="round" />
    <path d="M3.2 4.5v4h4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 7.6V12l3 1.8" strokeLinecap="round" />
  </svg>
);

export const IconCompass = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5z" strokeLinejoin="round" />
  </svg>
);

export const IconSparkle = (p: P) => (
  <svg viewBox="0 0 24 24" className={s(p)} fill="currentColor">
    <path d="M12 2.8 13.7 9l6.2 1.7-6.2 1.7L12 18.6l-1.7-6.2L4.1 10.7 10.3 9z" />
    <path d="M19 2.6 19.7 5l2.4.7-2.4.7L19 8.8l-.7-2.4-2.4-.7 2.4-.7z" />
  </svg>
);

export const IconModel = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z" strokeLinejoin="round" />
    <path d="M4 7.6 12 12l8-4.4M12 12v8.8" strokeLinejoin="round" />
  </svg>
);

export const IconRatio = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <rect x="3" y="6.5" width="13" height="11" rx="2" />
    <path d="M8 6.5V3.8h12.2V16" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconReset = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <path d="M20 12a8 8 0 1 1-2.5-5.8" strokeLinecap="round" />
    <path d="M20.4 4.6v4h-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} strokeWidth={1.8} className={s(p)}>
    <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" strokeLinecap="round" />
  </svg>
);

export const IconCheck = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} strokeWidth={2} className={s(p)}>
    <path d="m5 12.5 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} strokeWidth={1.8} className={s(p)}>
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

export const IconDiscord = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={s(p)}>
    <path d="M19.3 5.6A16 16 0 0 0 15.4 4.4l-.2.4a12 12 0 0 0-6.4 0l-.2-.4A16 16 0 0 0 4.7 5.6C2.2 9.3 1.5 12.9 1.9 16.5A16.2 16.2 0 0 0 6.8 19l.9-1.3c-.8-.3-1.6-.7-2.2-1.2l.5-.4a11.5 11.5 0 0 0 9.9 0l.5.4c-.7.5-1.4.9-2.2 1.2l.9 1.3a16.1 16.1 0 0 0 4.9-2.5c.5-4.2-.6-7.8-2.7-11.4zM8.7 14.3c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.8.9 1.7 2c0 1.1-.8 2-1.7 2zm6.6 0c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.8.9 1.7 2c0 1.1-.7 2-1.7 2z" />
  </svg>
);

export const IconX = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={s(p)}>
    <path d="M17.5 3h3l-6.6 7.5L21.7 21h-6l-4.7-6.1L5.6 21h-3l7-8L2.5 3h6.2l4.2 5.6zm-1 16.2h1.6L7.6 4.7H5.9z" />
  </svg>
);

export const IconDownload = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <path d="M12 3.5v11.4M7.5 10.6 12 15.1l4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.5 16.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconInstagram = (p: P) => (
  <svg viewBox="0 0 24 24" {...stroke} className={s(p)}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17" cy="7" r="1" fill="currentColor" stroke="none" />
  </svg>
);

/** The Blue Wing brand mark — transparent PNG cut from the logo artwork,
 *  tuned to sit on the dark shell. Pass a height class (e.g. `h-8`); width
 *  stays auto so the wing keeps its aspect ratio. */
export const IconWing = (p: P) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src="/wing-mark.png" alt="The Blue Wing" className={p.className ?? "h-8 w-auto"} />
);
