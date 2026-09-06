import Link from "next/link";
import Image from "next/image";
import { IconArrowRight, IconImage, IconVideo, IconCanvas, IconChat } from "@/components/Icons";
import { getLandingMediaMap } from "@/lib/landingMedia";
import styles from "./landing.module.css";

const features=[
  {id:"video",label:"01 / AI VIDEO",title:"讓想像，開始流動。",text:"從一句描述到一段影像。用文字或參考圖片，開啟你的下一個故事。",href:"/studio?mode=video",action:"開始影片創作",icon:IconVideo},
  {id:"image",label:"02 / AI IMAGE",title:"每個靈感，都值得被看見。",text:"探索不同模型與視覺風格，把腦海中的畫面變成作品。",href:"/studio?mode=image",action:"開始圖片創作",icon:IconImage},
  {id:"canvas",label:"03 / CREATIVE WORKFLOW",title:"把創意連起來。",text:"在智慧畫布排列素材與生成節點，建立自己的工作流程；也能進入 3D 導演台，探索構圖與鏡頭。",href:"/canvas",action:"開啟智慧畫布",icon:IconCanvas},
  {id:"companions",label:"04 / AI COMPANION",title:"生成，只是開始。",text:"創造你的角色，讓TA活起來——有記憶、有個性，陪你聊每一天的心情與故事。",href:"/companions",action:"認識你的 AI 夥伴",icon:IconChat},
];

export default async function HomePage(){
  const media = await getLandingMediaMap();
  return <div className={styles.page}>
  <header className={styles.header}>
    <Link href="/" className={styles.brand}><Image src="/wing-mark.png" width={38} height={38} alt=""/>The Blue Wing</Link>
    <nav aria-label="首頁導覽" className={styles.nav}><a href="#video">影片創作</a><a href="#image">圖片創作</a><a href="#canvas">智慧畫布</a><a href="#companions">AI 陪聊</a></nav>
    <Link href="/studio?mode=video" className={styles.smallCta}>開始創作 <IconArrowRight className="h-4 w-4"/></Link>
  </header>
  <section className={styles.hero}>
    {media.hero ? (
      media.hero.kind === "video"
        ? <video className={styles.heroMedia} src={media.hero.url} autoPlay muted loop playsInline aria-hidden="true"/>
        // eslint-disable-next-line @next/next/no-img-element
        : <img className={styles.heroMedia} src={media.hero.url} alt="" aria-hidden="true"/>
    ) : (
      <div className={styles.orbit} aria-hidden="true"><div/><div/><div/></div>
    )}
    {media.hero && <div className={styles.heroOverlay} aria-hidden="true"/>}
    <div className={styles.heroContent}>
      <p className={styles.eyebrow}>THE BLUE WING · CREATIVE STUDIO</p>
      <h1>一句話，<br/><span>一個世界。</span></h1>
      <p className={styles.subtitle}>生成，只是開始——讓TA活起來，才是故事的開頭。<br/>創造你的角色，然後愛上與TA相處的每一天。</p>
      <div className={styles.actions}><Link className={styles.primary} href="/studio?mode=video">開始創作 <IconArrowRight className="h-5 w-5"/></Link><a className={styles.secondary} href="#video">探索創作工具 <span>↓</span></a></div>
    </div>
    <div className={styles.heroFooter}><span>IMAGE / VIDEO / CANVAS / COMPANION</span><span>SCROLL TO EXPLORE ↓</span></div>
  </section>
  <div className={styles.features}>{features.map((f,i)=>{
    const m = media[f.id];
    return <section key={f.id} id={f.id} className={styles.feature}>
    <div className={styles.copy}><p className={styles.eyebrow}>{f.label}</p><h2>{f.title}</h2><p>{f.text}</p><Link href={f.href} className={styles.secondary}>{f.action}<IconArrowRight className="h-4 w-4"/></Link></div>
    <div className={`${styles.art} ${styles['art'+i]}`} aria-label={`${f.title}${m?"視覺展示":"抽象視覺展示"}`}>
      {m ? (
        m.kind === "video"
          ? <video className={styles.artMedia} src={m.url} autoPlay muted loop playsInline/>
          // eslint-disable-next-line @next/next/no-img-element
          : <img className={styles.artMedia} src={m.url} alt={f.title}/>
      ) : (<>
        <div className={styles.artHalo}/><f.icon className={styles.artIcon}/><span className={styles.artLabel}>{i===0?'FRAME YOUR IMAGINATION':i===1?'MAKE IT VISIBLE':i===2?'CONNECT YOUR IDEAS':'BRING TA TO LIFE'}</span>{i===2&&<div className={styles.nodes}><span>素材</span><b>→</b><span>靈感</span><b>→</b><span>作品</span></div>}
      </>)}
    </div>
  </section>;
  })}</div>
  <section className={styles.closing}><p className={styles.eyebrow}>PEOPLE + AI, TOGETHER</p><h2>Blue Wing——人與AI，<br/>共同振翅，邁向未來。</h2><Link href="/studio?mode=image" className={styles.primary}>立即開始 <IconArrowRight className="h-5 w-5"/></Link></section>
  <footer className={styles.footer}><span>The Blue Wing</span><div><Link href="/explore">創作探索</Link><Link href="/help">使用說明</Link><Link href="/login">登入帳號</Link></div></footer>
</div>;
}
