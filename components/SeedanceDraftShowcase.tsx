"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/client";
import { DRAFT_COPY } from "@/lib/i18n/draft";
import { DRAFT_SHOWCASE_MEDIA as media, DRAFT_STUDIO_HREF } from "@/lib/draftShowcase";
import styles from "./SeedanceDraftShowcase.module.css";

function timeLabel(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Stop decoding off-screen films and respect motion preferences until explicit playback. */
function useFilmVisibility() {
  const region = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.15 });
    if (region.current) observer.observe(region.current);
    return () => { query.removeEventListener("change", update); observer.disconnect(); };
  }, []);
  return { region, visible, reduced };
}

function ShowcaseFilm({ compact = false }: { compact?: boolean }) {
  const copy = DRAFT_COPY[useLocale()];
  const { region, visible, reduced } = useFilmVisibility();
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [explicitPlay, setExplicitPlay] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const shouldPlay = playing && visible && (!reduced || explicitPlay) && !failed;
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    let active = true;
    if (shouldPlay) void player.play().catch(() => { if (active) setPlaying(false); });
    else player.pause();
    return () => { active = false; player.pause(); };
  }, [shouldPlay]);
  const toggle = () => { setExplicitPlay(true); setPlaying(shouldPlay ? false : true); };
  return <div ref={region} className={`${styles.film} ${compact ? styles.compactFilm : ""}`}>
    {media.heroFinal ? <video
      ref={video} src={media.heroFinal} poster={media.heroPoster || undefined}
      muted={muted} loop playsInline preload="metadata" aria-label={copy.filmTitle}
      onTimeUpdate={() => setProgress(video.current?.currentTime ?? 0)}
      onError={() => { setFailed(true); setPlaying(false); }}
    /> : <div className={styles.preparing} role="status">{copy.preparing}</div>}
    <div className={styles.filmTop}><span>THE BLUE WING / ORIGINAL FILM</span><span>{timeLabel(media.durationSeconds)}</span></div>
    {media.heroFinal && <div className={styles.filmControls} aria-label={copy.filmControls}>
      <button onClick={toggle} aria-label={shouldPlay ? copy.pause : copy.play}><span aria-hidden="true">{shouldPlay ? "Ⅱ" : "▶"}</span><span>{shouldPlay ? copy.pause : copy.play}</span></button>
      {!compact && <><span className={styles.filmTime}>{timeLabel(progress)} / {timeLabel(media.durationSeconds)}</span><button aria-label={muted ? copy.soundOn : copy.soundOff} aria-pressed={!muted} onClick={() => setMuted(!muted)}>{muted ? copy.soundOn : copy.soundOff}</button></>}
    </div>}
    {failed && <div role="status" className={styles.mediaError}><p>{copy.mediaError}</p><button onClick={() => { setFailed(false); setPlaying(true); setExplicitPlay(true); video.current?.load(); }}>{copy.retry}</button></div>}
  </div>;
}

function DraftComparison() {
  const copy = DRAFT_COPY[useLocale()];
  const { region, visible, reduced } = useFilmVisibility();
  const draft = useRef<HTMLVideoElement>(null);
  const final = useRef<HTMLVideoElement>(null);
  const [view, setView] = useState<"compare" | "draft" | "final">("compare");
  const [divider, setDivider] = useState(50);
  const [detail, setDetail] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [explicitPlay, setExplicitPlay] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [duration, setDuration] = useState(media.durationSeconds);
  const [progress, setProgress] = useState(0);
  const available = Boolean(media.comparisonDraft && media.comparisonFinal);
  const shouldPlay = available && ready && playing && visible && (!reduced || explicitPlay) && !failed;
  useEffect(() => {
    if (!available) return;
    const a = draft.current, b = final.current;
    if (!a || !b) return;
    const checkReady = () => {
      if (a.error || b.error) { setReady(false); setFailed(true); setPlaying(false); return; }
      // Metadata is enough to start/seek; requiring a decoded frame can deadlock
      // browsers that honor preload="metadata" and wait for play() to fetch it.
      if (a.readyState < 1 || b.readyState < 1 || !a.videoWidth || !b.videoWidth) return;
      if (!Number.isFinite(a.duration) || !Number.isFinite(b.duration) || a.duration <= 0 || b.duration <= 0) return;
      setDuration(Math.min(a.duration, b.duration));
      setReady(true);
    };
    const resetReady = () => setReady(false);
    const events = ["loadedmetadata", "loadeddata", "canplay", "canplaythrough", "error"] as const;
    for (const player of [a, b]) {
      for (const event of events) player.addEventListener(event, checkReady);
      player.addEventListener("emptied", resetReady);
    }
    // Cached media can finish loading before React hydrates. Read its actual state
    // after installing listeners rather than relying only on already-fired events.
    checkReady();
    return () => {
      for (const player of [a, b]) {
        for (const event of events) player.removeEventListener(event, checkReady);
        player.removeEventListener("emptied", resetReady);
      }
    };
  }, [available]);
  useEffect(() => {
    const a = draft.current, b = final.current;
    if (!a || !b) return;
    let active = true;
    let frame = 0;
    const sync = () => {
      if (!active) return;
      // Final is the clock; two independent autoplay loops otherwise drift over time.
      if (Math.abs(a.currentTime - b.currentTime) > 0.075 && !a.seeking && !b.seeking) a.currentTime = b.currentTime;
      frame = requestAnimationFrame(sync);
    };
    if (shouldPlay) {
      a.currentTime = b.currentTime;
      void Promise.all([a.play(), b.play()]).then(() => { if (active) frame = requestAnimationFrame(sync); }).catch(() => {
        a.pause(); b.pause(); if (active) setPlaying(false);
      });
    } else { a.pause(); b.pause(); }
    return () => { active = false; cancelAnimationFrame(frame); a.pause(); b.pause(); };
  }, [shouldPlay]);
  const seek = (value: number) => {
    const seconds = Math.min(Math.max(0, value), duration);
    if (draft.current && final.current && ready) { draft.current.currentTime = seconds; final.current.currentTime = seconds; setProgress(seconds); }
  };
  const failure = () => { setFailed(true); setPlaying(false); };
  const clip = view === "draft" ? "inset(0 100% 0 0)" : view === "final" ? "inset(0 0 0 0)" : `inset(0 0 0 ${divider}%)`;
  return <div ref={region} className={styles.comparison}>
    <div className={styles.compareToolbar}>
      <div className={styles.modeButtons} role="group" aria-label={copy.comparisonControls}>
        {(["compare", "draft", "final"] as const).map(mode => <button key={mode} aria-pressed={view === mode} onClick={() => setView(mode)}>{copy[mode]}</button>)}
      </div>
      <button className={styles.detailButton} aria-pressed={detail} onClick={() => setDetail(!detail)}>{detail ? copy.fullFrame : copy.detail} <span aria-hidden="true">{detail ? "↙" : "↗"}</span></button>
    </div>
    <div className={`${styles.compareStage} ${detail ? styles.detailStage : ""}`}>
      {available ? <>
        <video ref={draft} src={media.comparisonDraft} poster={media.comparisonPoster || undefined} muted loop playsInline preload="metadata" aria-label={copy.draft} onError={failure} />
        <div className={styles.finalLayer} style={{ clipPath: clip }}><video ref={final} src={media.comparisonFinal} poster={media.comparisonPoster || undefined} muted loop playsInline preload="metadata" aria-label={copy.final} onError={failure} onTimeUpdate={() => setProgress(final.current?.currentTime ?? 0)} /></div>
      </> : <div className={styles.preparing} role="status">{copy.preparing}</div>}
      {(view === "draft" || (view === "compare" && divider > 18)) && <span className={`${styles.resolution} ${styles.draftLabel}`}>480p <small>{media.draftWidth} × {media.draftHeight}</small></span>}
      {(view === "final" || (view === "compare" && divider < 82)) && <span className={`${styles.resolution} ${styles.finalLabel}`}>1080p <small>{media.finalWidth} × {media.finalHeight}</small></span>}
      {view === "compare" && <div aria-hidden="true" className={styles.divider} style={{ left: `${divider}%` }}><span>↔</span></div>}
      {view === "compare" && <input className={styles.stageRange} type="range" min="0" max="100" step="1" value={divider} onChange={event => setDivider(Number(event.target.value))} tabIndex={-1} aria-hidden="true" />}
      {detail && <span className={styles.detailLabel}>1.8×</span>}
      {failed && <div role="status" className={styles.mediaError}><p>{copy.mediaError}</p><button onClick={() => { setFailed(false); setReady(false); setPlaying(true); draft.current?.load(); final.current?.load(); }}>{copy.retry}</button></div>}
    </div>
    {view === "compare" && <label className={styles.dividerControl}><span>{copy.draft}</span><input type="range" min="0" max="100" step="1" value={divider} onChange={event => setDivider(Number(event.target.value))} aria-label={copy.divider} /><span>{copy.final}</span></label>}
    <div className={styles.timeline}>
      <button disabled={!available || !ready || failed} onClick={() => { setExplicitPlay(true); setPlaying(shouldPlay ? false : true); }} aria-label={shouldPlay ? copy.pause : copy.play}><span aria-hidden="true">{shouldPlay ? "Ⅱ" : "▶"}</span></button>
      <input type="range" min="0" max={duration || 1} step="0.01" value={Math.min(progress, duration)} onChange={event => seek(Number(event.target.value))} disabled={!ready || failed} aria-label={copy.seek} aria-valuetext={`${timeLabel(progress)} / ${timeLabel(duration)}`} />
      <span>{timeLabel(progress)} / {timeLabel(duration)}</span>
    </div>
    <p className={styles.originalNote}>{copy.original}</p>
  </div>;
}

export function SeedanceDraftHomeEntry() {
  const copy = DRAFT_COPY[useLocale()];
  return <section className={styles.homeEntry} aria-labelledby="draft-home-title">
    <div className={styles.homeEntryText}><p className={styles.eyebrow}>SEEDANCE 2.5 / DRAFT TO FINAL</p><h2 id="draft-home-title">{copy.homeTitle}</h2><p>{copy.homeDescription}</p><Link href="/seedance-draft">{copy.homeCta}<span aria-hidden="true">↗</span></Link></div>
    <ShowcaseFilm compact />
  </section>;
}

export default function SeedanceDraftShowcase() {
  const copy = DRAFT_COPY[useLocale()];
  return <div className={styles.page}><main className={styles.container}>
    <nav className={styles.breadcrumb} aria-label={copy.feature}><Link href="/">{copy.home}</Link><span aria-hidden="true">/</span><span>{copy.feature}</span></nav>
    <header className={styles.intro}>
      <div><p className={styles.eyebrow}>THE BLUE WING / A STUDY IN MOTION</p><h1>{copy.headlineFirst}<span>{copy.headlineSecond}</span></h1></div>
      <div className={styles.introAside}><p>{copy.introduction}</p><div className={styles.introLinks}><a href="#comparison">{copy.explore}<span aria-hidden="true">↓</span></a><Link href={DRAFT_STUDIO_HREF}>{copy.create}<span aria-hidden="true">↗</span></Link></div></div>
    </header>
    <section aria-labelledby="draft-film-title" className={styles.filmSection}>
      <ShowcaseFilm />
      <div className={styles.filmCaption}><div><p className={styles.eyebrow}>01 / THE FILM</p><h2 id="draft-film-title">{copy.filmTitle}</h2></div><p>{copy.filmDescription}</p>{media.heroFinal && <a href={media.heroFinal} download="The-Blue-Wing-Draft-to-Final.mp4">{copy.download}<span aria-hidden="true">↓</span></a>}</div>
    </section>
    <section id="comparison" aria-labelledby="draft-comparison-title" className={styles.section}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>02 / THE SAME MOMENT</p><h2 id="draft-comparison-title">{copy.comparisonTitle}</h2></div><p>{copy.comparisonDescription}</p></div>
      <DraftComparison />
      <div className={styles.observations}>{(["composition", "motion", "texture"] as const).map((key, index) => <div key={key}><span>0{index + 1}</span><h3>{copy[key]}</h3><p>{copy[`${key}Text`]}</p></div>)}</div>
    </section>
    <section aria-labelledby="draft-process-title" className={styles.section}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>03 / THE PRACTICE</p><h2 id="draft-process-title">{copy.processTitle}</h2></div><p>{copy.processIntro}</p></div>
      <ol className={styles.process}>{(["One", "Two", "Three"] as const).map((key, index) => <li key={key}><span>0{index + 1}</span><div><h3>{copy[`step${key}`]}</h3><p>{copy[`step${key}Text`]}</p></div><span aria-hidden="true" className={styles.processArrow}>{index === 2 ? "↗" : "↓"}</span></li>)}</ol>
      <aside className={styles.rules}><div><h3>{copy.rulesTitle}</h3><Link className={styles.historyLink} href="/drafts">{copy.history}<span aria-hidden="true">↗</span></Link></div><ul>{[copy.ruleResolution, copy.ruleExpiry, copy.ruleCredits, copy.ruleAudio].map(rule => <li key={rule}>{rule}</li>)}</ul></aside>
    </section>
    <footer className={styles.finish}><div><p className={styles.eyebrow}>CONTINUE YOUR STORY</p><h2>{copy.finishTitle}</h2><p>{copy.finishText}</p></div><Link href={DRAFT_STUDIO_HREF}>{copy.create}<span aria-hidden="true">↗</span></Link></footer>
  </main></div>;
}
