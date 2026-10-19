import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { avatarCopy } from "@/lib/i18n/avatar";
import styles from "@/components/business/Business.module.css";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = avatarCopy(await getLocale());
  return { title: t.title, description: t.intro, alternates: { canonical: "/avatar" } };
}
/** Readiness only: no upload or generation before duration billing is verified. */
export default async function AvatarPage() {
  const t = avatarCopy(await getLocale());
  return <div className={styles.page}><div className={styles.inner}>
    <header className={styles.hero}><div><p className={styles.eyebrow}>THE BLUE WING / PORTRAIT IN MOTION</p><h1>{t.title}</h1><p>{t.intro}</p></div><div className={styles.heroArt} aria-hidden="true"><i className={styles.artLine} /><i className={styles.artLine} /><span className={styles.artCaption}>A VOICE.<br />A FACE. A PRESENCE.</span></div></header>
    <section className={styles.panel}><div className={styles.panelHead}><div><span className={styles.status}>{t.preparing}</span><h2 className={styles.heading} style={{ marginTop: 16 }}>{t.prepareTitle}</h2><p className={styles.description}>{t.prepareText}</p></div></div><p className={styles.warning}>{t.billingGate}</p></section>
    <div className={styles.grid}>{[
      { number: "01", name: "Kling Avatar", title: t.avatarTitle, text: t.avatarText, detail: t.avatarDetail, href: "https://docs.siraya.ai/docs/api-reference/generative-model-api/avatar/clip-generation/" },
      { number: "02", name: "Kling Lip Sync", title: t.lipTitle, text: t.lipText, detail: t.lipDetail, href: "https://docs.siraya.ai/docs/api-reference/generative-model-api/avatar/lip-sync/" },
    ].map(item => <section className={styles.panel} key={item.name} style={{ borderTop: "1px solid #34413a" }}><p className={styles.eyebrow}>{item.number} / {item.name}</p><h2 className={styles.heading}>{item.title}</h2><p className={styles.description}>{item.text}</p><p className={styles.note}>{item.detail}</p><p className={styles.note}>{t.preparing}</p><div style={{ marginTop: 20 }}><a href={item.href} target="_blank" rel="noreferrer" className={styles.subtleLink}>{t.source} ↗</a></div></section>)}</div>
    <section className={styles.panel}><h2 className={styles.heading}>{t.processTitle}</h2><div className={styles.principles}>{[[t.stepOne, t.stepOneText], [t.stepTwo, t.stepTwoText], [t.stepThree, t.stepThreeText]].map(([title, text], index) => <div className={styles.principle} key={title}><span>0{index + 1}</span><h2>{title}</h2><p>{text}</p></div>)}</div><p className={styles.note}>{t.languageNotice}</p><div style={{ marginTop: 24 }}><Link href="/business" className={styles.secondary}>{t.business} ↗</Link></div></section>
  </div></div>;
}
