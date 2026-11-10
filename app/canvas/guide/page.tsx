import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { guideCopy } from "./copy";
import styles from "./guide.module.css";

const GUIDE = "/canvas/guide";
const TEMPLATE = "/canvas/templates/-114";
const DEMO = "/official-canvas-previews/114-demo";
const COVER = "/official-canvas-previews/114.svg";
const DEMO_AVAILABLE = false;
const SHOT_TIMES = ["00:00–00:06", "00:06–00:12", "00:12–00:18", "00:18–00:24"];

export async function generateMetadata(): Promise<Metadata> {
  const t = guideCopy[await getLocale()];
  return {
    title: t.title,
    description: t.description,
    alternates: { canonical: GUIDE },
    robots: { index: true, follow: true },
    openGraph: { title: t.title, description: t.description, url: GUIDE, images: [DEMO_AVAILABLE ? `${DEMO}.jpg` : COVER] },
  };
}

export default async function WorkflowGuide() {
  const locale = await getLocale();
  const t = guideCopy[locale];

  return (
    <div className={styles.scroll}>
      <article className={styles.guide}>
        <header className={styles.intro}>
          <h1>{t.title}</h1>
          <p>{t.description}</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href={TEMPLATE}>{t.preview}</Link>
            <Link className={styles.secondary} href="/canvas">{t.canvas}</Link>
          </div>
        </header>

        <section className={styles.template} aria-labelledby="ferry-title">
          <div className={styles.cover}>
            {DEMO_AVAILABLE ? <video
              aria-labelledby="ferry-title"
              aria-describedby="ferry-format"
              controls
              playsInline
              poster={`${DEMO}.jpg`}
              preload="metadata"
            >
              <source src={`${DEMO}.mp4`} type="video/mp4" />
              <track kind="captions" src={`${DEMO}.${locale}.vtt`} srcLang={locale} label={t.captions} />
              <a href={`${DEMO}.mp4`}>{t.openVideo}</a>
            </video> : <Image src={COVER} alt={t.templateName} width={1200} height={675} unoptimized preload />}
          </div>
          <div className={styles.ticket}>
            {DEMO_AVAILABLE && <p className={styles.demo}>{t.demo}</p>}
            <h2 id="ferry-title">{t.templateName}</h2>
            <p className={styles.duration} id="ferry-format">{t.duration}</p>
            <p className={styles.synopsis}>{t.synopsis}</p>
          </div>
        </section>

        <section className={styles.sequence} aria-labelledby="shot-heading">
          <h2 id="shot-heading">{t.shotHeading}</h2>
          <ol className={styles.shots}>
            {t.shots.map((shot, index) => (
              <li key={shot.title}>
                <p className={styles.timecode}>{SHOT_TIMES[index]}</p>
                <h3>{shot.title}</h3>
                <p>{shot.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.method} aria-labelledby="steps-heading">
          <h2 id="steps-heading">{t.stepsHeading}</h2>
          <ol className={styles.steps}>
            {t.steps.map((step, index) => (
              <li key={step.title}>
                <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
                <h3>{step.title}</h3>
                <div>
                  <p>{step.detail}</p>
                  <p className={styles.check}><strong>{t.checkpoint}</strong> {step.check}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className={styles.actions}>
            <Link className={styles.primary} href={TEMPLATE}>{t.preview}</Link>
          </div>
          <aside className={styles.business}>
            <p>{t.businessHint}</p>
            <Link className={styles.secondary} href="/business?tab=workflows">{t.businessLink}</Link>
          </aside>
        </section>
      </article>
    </div>
  );
}
