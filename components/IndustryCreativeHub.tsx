"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";
import { INDUSTRY_SKILLS, getLocalizedSkill, buildIndustryPrompt } from "@/lib/industrySkills";
import { createIndustryHandoff } from "@/lib/industryHandoff";
import styles from "./IndustryCreativeHub.module.css";

const COPY = {
  "zh-Hant": {
    title: "讓創意，有自己的樣子。", intro: "商品、廣告、遊戲與影像藝術。選一個方向，寫進你的想法。",
    all: "精選", commerce: "電商商品", advertising: "品牌廣告", games: "遊戲世界", art: "影像藝術",
    heading: "你想創作什麼？", search: "搜尋創作技能", searchPlaceholder: "找商品、角色、廣告…", count: "個創作方案",
    configure: "打開創作簡報", pause: "暫停動態預覽", play: "播放動態預覽", image: "圖片", video: "影片",
    style: "風格參考", layout: "概念版式", empty: "沒有相符的方案，換個關鍵字看看。", reset: "清除搜尋",
    close: "關閉創作簡報", brief: "寫下你的簡報", required: "必填", output: "本次創作", workflow: "建議製作順序",
    prompt: "可編輯提示詞", promptHint: "調整簡報會重新整理提示詞。完成後，可直接修改文字。",
    apply: "帶入生成頁", copy: "複製提示詞", copied: "提示詞已複製", copyFailed: "無法自動複製，請選取上方提示詞後複製。", cancel: "先回去看看",
    missing: "請填寫：", missingPrompt: "請先填寫提示詞。", tooLong: "提示詞請控制在 12,000 字以內。",
    reviewNote: "先帶入提示詞與選擇素材；生成頁確認模型、規格與點數後，才會開始製作。",
    mediaNote: "目前為提示詞方案初版；標示「風格參考」的是藍翼既有作品，新方案的專屬示範將陸續加入。",
    link: "查看方案", studio: "自由創作", plan: "創作方案", build: "簡報 → 提示詞 → 創作", more: "探索全部方案", less: "收回精選", storageError: "瀏覽器無法暫存簡報。請複製提示詞，再開啟生成頁。",
  },
  en: {
    title: "Make it unmistakably yours.", intro: "Products, campaigns, game worlds and visual art. Pick a direction. Make it your own.",
    all: "Selected", commerce: "Commerce", advertising: "Advertising", games: "Game worlds", art: "Visual art",
    heading: "What will you make?", search: "Search creative skills", searchPlaceholder: "Find products, characters, campaigns…", count: "creative plans",
    configure: "Open creative brief", pause: "Pause motion previews", play: "Play motion previews", image: "Image", video: "Video",
    style: "Style reference", layout: "Layout concept", empty: "No matching plans. Try another keyword.", reset: "Clear search",
    close: "Close creative brief", brief: "Make the brief yours", required: "Required", output: "This creation", workflow: "Suggested production order",
    prompt: "Editable prompt", promptHint: "Changing the brief rebuilds the prompt. Edit the wording after your brief is ready.",
    apply: "Open in studio", copy: "Copy prompt", copied: "Prompt copied", copyFailed: "Copy is unavailable. Select and copy the prompt above.", cancel: "Keep exploring",
    missing: "Please complete: ", missingPrompt: "Please enter a prompt first.", tooLong: "Keep the prompt within 12,000 characters.",
    reviewNote: "The prompt opens in the studio. Choose references, model and settings, then review credits before generating.",
    mediaNote: "These are first-edition prompt plans. “Style reference” shows existing Blue Wing work; dedicated examples will follow.",
    link: "Explore plan", studio: "Free creation", plan: "Creative plan", build: "Brief → Prompt → Create", more: "Explore every plan", less: "Back to selected", storageError: "Your browser cannot store this draft. Copy the prompt and open the studio instead.",
  },
  ja: {
    title: "創造に、あなたらしさを。", intro: "商品、広告、ゲーム、映像アート。作りたいものから、始めよう。",
    all: "おすすめ", commerce: "商品・EC", advertising: "ブランド広告", games: "ゲームの世界", art: "映像アート",
    heading: "何を、つくろう？", search: "制作スキルを検索", searchPlaceholder: "商品、キャラクター、広告を探す…", count: "件の制作プラン",
    configure: "制作ブリーフを開く", pause: "動くプレビューを一時停止", play: "動くプレビューを再生", image: "画像", video: "動画",
    style: "作風の参考", layout: "レイアウト案", empty: "該当するプランがありません。別の言葉で検索してください。", reset: "検索をクリア",
    close: "制作ブリーフを閉じる", brief: "あなたの企画を書こう", required: "必須", output: "今回の制作", workflow: "おすすめの制作順序",
    prompt: "編集できるプロンプト", promptHint: "ブリーフを変えると文章が再構成されます。入力を終えてから自由に編集してください。",
    apply: "制作画面へ", copy: "プロンプトをコピー", copied: "コピーしました", copyFailed: "コピーできません。上の文章を選択してコピーしてください。", cancel: "一覧へ戻る",
    missing: "入力してください：", missingPrompt: "プロンプトを入力してください。", tooLong: "プロンプトは12,000文字以内で入力してください。",
    reviewNote: "制作画面で素材、モデル、仕様、必要ポイントを確認してから生成します。",
    mediaNote: "プロンプトプランの初版です。「作風の参考」は既存の藍翼作品です。専用の作例は順次追加します。",
    link: "プランを見る", studio: "自由に制作", plan: "制作プラン", build: "ブリーフ → プロンプト → 制作", more: "すべてのプランを見る", less: "おすすめに戻る", storageError: "ブラウザに保存できません。プロンプトをコピーして制作画面を開いてください。",
  },
} satisfies Record<Locale, Record<string, string>>;

type Cover = { image?: string; video?: string; word?: string; tone: string };
// Only already-public Blue Wing media. Concept typography is not a generated product example.
const COVERS: Record<string, Cover[]> = {
  commerce: [
    { word: "THE\nOBJECT.", tone: "paper" }, { word: "FORM\n& LIGHT", tone: "blue" },
    { word: "SMALL\nDETAILS.", tone: "sand" }, { word: "DAILY\nRITUALS", tone: "rose" },
  ],
  advertising: [
    { image: "/official-template-posters/negative-space.jpg", tone: "photo" },
    { word: "MAKE\nA MARK.", tone: "blue" },
    { image: "/official-template-posters/in-medias-res.jpg", tone: "photo" },
    { word: "FEEL\nSOMETHING.", tone: "paper" },
  ],
  games: [
    { image: "/official-canvas-previews/105.jpg", video: "/official-canvas-previews/105.mp4", tone: "photo" },
    { image: "/official-canvas-previews/103.jpg", tone: "photo" },
    { image: "/official-template-posters/genre.jpg", tone: "photo" },
    { image: "/official-template-posters/effects.jpg", tone: "photo" },
  ],
  art: [
    { image: "/home-films/art.jpg", video: "/home-films/art.mp4", tone: "photo" },
    { image: "/official-template-posters/film-noir.jpg", tone: "photo" },
    { image: "/official-template-posters/dappled-light.jpg", tone: "photo" },
    { word: "BEYOND\nTHE FRAME", tone: "sand" },
  ],
};

function coverFor(id: string): Cover {
  const skill = INDUSTRY_SKILLS.find(item => item.id === id)!;
  const siblings = INDUSTRY_SKILLS.filter(item => item.category === skill.category);
  return COVERS[skill.category][siblings.findIndex(item => item.id === id) % 4];
}

function MotionCover({ cover, enabled }: { cover: Cover; enabled: boolean }) {
  const region = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!cover.video) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAllowed(!mq.matches);
    const page = () => setPageVisible(document.visibilityState !== "hidden");
    update(); page(); mq.addEventListener("change", update);
    document.addEventListener("visibilitychange", page);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    if (region.current) observer.observe(region.current);
    return () => { observer.disconnect(); mq.removeEventListener("change", update); document.removeEventListener("visibilitychange", page); };
  }, [cover.video]);
  const play = enabled && allowed && visible && pageVisible && !failed;
  useEffect(() => {
    const video = player.current;
    if (!video) return;
    if (play) void video.play().catch(() => { /* The poster remains when autoplay is blocked. */ });
    else video.pause();
    return () => video.pause();
  }, [play]);
  return <div ref={region} className={`${styles.cover} ${styles[cover.tone]}`} aria-hidden="true">
    {cover.video && allowed && visible && !failed ? <video ref={player} src={cover.video} poster={cover.image} muted loop playsInline preload="none" onError={() => setFailed(true)} /> : cover.image ?
      // eslint-disable-next-line @next/next/no-img-element -- existing same-origin artwork; not a new industry result
      <img src={cover.image} alt="" loading="lazy" /> : null}
    {cover.word && <div className={styles.typeArtwork}><span className={styles.typeMark}>The Blue Wing</span><span className={styles.typeWord}>{cover.word}</span><span className={styles.typeFooter}>Creative direction / Studio notes</span></div>}
  </div>;
}

function SkillBrief({ id, onClose }: { id: string; onClose: () => void }) {
  const locale = useLocale(), copy = COPY[locale], router = useRouter();
  const skill = getLocalizedSkill(id, locale)!;
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [override, setOverride] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const built = useMemo(() => buildIndustryPrompt(id, values, locale), [id, values, locale]);
  const prompt = override ?? built.prompt;
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => { el?.close(); };
  }, []);
  const close = () => { dialog.current?.close(); onClose(); };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (!built.isComplete) {
      const labels = skill.fields.filter(field => built.missingFields.includes(field.key)).map(field => field.label);
      setError(copy.missing + labels.join("、"));
      dialog.current?.querySelector<HTMLElement>(`[name="${built.missingFields[0]}"]`)?.focus();
      return;
    }
    if (!prompt.trim() || prompt.length > 12000) { setError(prompt.trim() ? copy.tooLong : copy.missingPrompt); return; }
    try {
      const url = createIndustryHandoff(sessionStorage, skill.mediaType, prompt.trim(), locale);
      router.push(url);
    } catch { setError(copy.storageError); }
  };
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(prompt); setNotice(copy.copied); }
    catch { setNotice(copy.copyFailed); }
  };
  return <dialog ref={dialog} className={styles.modal} aria-labelledby="industry-brief-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={styles.modalInner}>
      <header className={styles.modalHeader}><div><span>{copy[skill.category]} / {copy.plan}</span><h2 id="industry-brief-title">{skill.title}</h2></div><button type="button" onClick={close} className={styles.close} aria-label={copy.close}>×</button></header>
      <form onSubmit={submit} noValidate>
        <div className={styles.briefGrid}>
          <div className={styles.briefFields}><h3>{copy.brief}</h3><p>{skill.summary}</p>
            {skill.fields.map(field => <label key={field.key} htmlFor={`industry-${field.key}`} className={styles.field}><span>{field.label}{field.required && <small>{copy.required}</small>}</span><textarea id={`industry-${field.key}`} name={field.key} value={values[field.key] ?? ""} required={field.required} maxLength={2000} rows={2} placeholder={field.placeholder} onChange={event => { setValues(previous => ({ ...previous, [field.key]: event.target.value })); setOverride(null); setError(""); setNotice(""); }} /></label>)}
          </div>
          <div className={styles.briefPreview}>
            <section><h3>{copy.output}</h3><p>{skill.deliverable}</p></section>
            <details className={styles.workflowDetails}><summary>{copy.workflow}</summary><ol>{skill.workflow.map(step => <li key={step.id}><strong>{step.title}</strong><br />{step.description}</li>)}</ol></details>
            <label className={styles.field} htmlFor="industry-prompt"><span>{copy.prompt}</span><textarea id="industry-prompt" name="editedPrompt" rows={14} maxLength={12000} value={prompt} onChange={event => { setOverride(event.target.value); setNotice(""); }} /><small className={styles.promptHint}>{copy.promptHint}</small></label>
            <button type="button" className={styles.copyButton} onClick={copyPrompt}>{copy.copy}</button><p role="status" className={styles.notice}>{notice}</p>
          </div>
        </div>
        <footer className={styles.modalFooter}><div><p>{copy.reviewNote}</p>{error && <p role="alert" className={styles.error}>{error}</p>}</div><div className={styles.footerActions}><button type="button" className={styles.secondary} onClick={close}>{copy.cancel}</button><button type="submit" className={styles.primary}>{copy.apply} <span aria-hidden="true">↗</span></button></div></footer>
      </form>
    </div>
  </dialog>;
}

export default function IndustryCreativeHub() {
  const locale = useLocale(), copy = COPY[locale];
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [motion, setMotion] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const skills = INDUSTRY_SKILLS.map(item => getLocalizedSkill(item.id, locale)!);
  // Interleave industries so the first screen represents more than one kind of work.
  const ordered = Array.from({ length: 4 }, (_, index) => ["games", "commerce", "art", "advertising"].map(group => skills.filter(item => item.category === group)[index])).flat().filter(Boolean);
  const needle = query.trim().toLocaleLowerCase(locale);
  const items = ordered.filter(item => (category === "all" || item.category === category) && (!needle || [item.title, item.summary, item.deliverable, copy[item.category]].join(" ").toLocaleLowerCase(locale).includes(needle)));
  const displayItems = category === "all" && !needle && !expanded ? items.slice(0, 8) : items;
  const close = () => { setSelected(null); trigger.current?.focus(); };
  return <section className={styles.hub} aria-labelledby="industry-home-title" data-industry-hub>
    <header className={styles.header}><div><h1 id="industry-home-title">{copy.title}</h1><p>{copy.intro}</p></div><a href="/studio?mode=video" className={styles.studioLink}>{copy.studio}<span aria-hidden="true">↗</span></a></header>
    <div className={styles.exploreBar}>
      <div className={styles.categories} role="group" aria-label={copy.heading}>{(["all", "commerce", "advertising", "games", "art"] as const).map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{copy[value]}</button>)}</div>
      <label className={styles.search}><span className={styles.srOnly}>{copy.search}</span><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} /></label>
    </div>
    <div className={styles.galleryHeading}><h2>{copy.heading}</h2><div><span role="status">{items.length} {copy.count}</span><button type="button" className={styles.motionToggle} aria-label={motion ? copy.pause : copy.play} aria-pressed={!motion} onClick={() => setMotion(value => !value)}>{motion ? "Ⅱ" : "▶"}</button></div></div>
    <div className={styles.gallery}>
      {displayItems.map((skill, index) => { const cover = coverFor(skill.id); return <article key={skill.id} className={`${styles.card} ${styles[`shape${index % 4}`]}`}>
        <button type="button" className={styles.cardButton} aria-label={`${copy.configure}：${skill.title}`} onClick={event => { trigger.current = event.currentTarget; setSelected(skill.id); }}>
          <MotionCover cover={cover} enabled={motion && !selected} />
          <div className={styles.cardLabel}><span>{copy[skill.category]}</span><span>{copy[skill.mediaType]} <span aria-hidden="true">↗</span></span></div>
          <div className={styles.cardBody}><h3>{skill.title}</h3><p>{skill.summary}</p><div><span>{cover.image ? copy.style : copy.layout}</span><span>{copy.link} <span aria-hidden="true">↗</span></span></div></div>
        </button>
      </article>; })}
    </div>
    {category === "all" && !needle && items.length > 8 && <button type="button" className={styles.showMore} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? copy.less : copy.more} <span aria-hidden="true">{expanded ? "↑" : "↓"}</span></button>}
    {!items.length && <div className={styles.empty}><p>{copy.empty}</p><button type="button" onClick={() => { setQuery(""); setCategory("all"); }}>{copy.reset}</button></div>}
    <p className={styles.mediaNote}>{copy.mediaNote}</p>
    {selected && <SkillBrief key={`${selected}-${locale}`} id={selected} onClose={close} />}
  </section>;
}
