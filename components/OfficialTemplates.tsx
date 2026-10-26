"use client";

import { useState } from "react";
import Link from "next/link";
import TemplatePreview from "./TemplatePreview";
import { OFFICIAL_TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/officialTemplates";
import { useTr } from "@/lib/i18n/client";
import styles from "./HomeEditorial.module.css";

export default function OfficialTemplates() {
  const tr = useTr();
  const [category, setCategory] = useState("全部");
  const [playing, setPlaying] = useState<string | null>(null);
  const items = OFFICIAL_TEMPLATES.filter(item => category === "全部" || item.category === category);

  return <section id="official-templates" aria-label={tr("官方電影模板")} className={styles.archive}>
    <div className={styles.archiveHeading}>
      <div><h2>{tr("官方電影模板")}</h2><p>{tr("從一個鏡頭開始，找到你的故事風格。")}</p></div>
      <span className={styles.archiveCount}>{OFFICIAL_TEMPLATES.length} {tr("個模板 · Seedance 2.0 mini")}</span>
    </div>
    <div className={styles.filters} role="group" aria-label={tr("模板分類")}>
      {["全部", ...TEMPLATE_CATEGORIES].map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => { setCategory(value); setPlaying(null); }}>
        {tr(value)}<span>{OFFICIAL_TEMPLATES.filter(item => value === "全部" || item.category === value).length}</span>
      </button>)}
    </div>
    <div className={styles.archiveGrid}>
      {items.map(item => <article key={item.id} className={styles.film}>
        <div className="relative">
          <TemplatePreview id={item.id} revision={item.revision} title={tr(item.title)} active={playing === item.id} onToggle={() => setPlaying(playing === item.id ? null : item.id)} />
          <span className={styles.filmCategory}>{tr(item.category)}</span>
        </div>
        <div>
          <div className="flex items-start justify-between gap-3"><h3>{tr(item.title)}</h3><span className={styles.filmMeta}>{item.seconds}s · 720p</span></div>
          <p className={styles.filmTechnique}>{item.technique} · {tr(item.character)}</p>
          <details><summary>{tr("查看提示詞")}</summary><p className="max-h-44 overflow-y-auto whitespace-pre-wrap">{item.prompt}</p></details>
          <Link href={`/studio?mode=video&operation=freestyle&official=${item.id}`}>{tr("套用模板 ↗")}</Link>
        </div>
      </article>)}
    </div>
    <p className={styles.archiveNote}>{tr("套用後可替換角色素材與提示詞；生成前會顯示所需點數。")}</p>
  </section>;
}
