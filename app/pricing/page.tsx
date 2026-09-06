import Link from "next/link";
import { PLANS } from "@/lib/plans";
import { CREDIT_PACKS } from "@/lib/creditPacks";
export default function PricingPage(){return <div className="h-full overflow-y-auto"><div className="mx-auto max-w-6xl px-5 py-12">
<h1 className="text-3xl font-semibold">選擇適合你的創作方案</h1><p className="mt-3 text-sm text-neutral-400">價格以美元計算。付費方案與增購點數目前由管理員協助開通，尚未提供線上付款。</p>
<div className="my-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{PLANS.map(p=><section key={p.code} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6"><h2 className="text-xl">{p.name}</h2><p className="my-5 text-3xl">$ {p.priceUSD}<span className="text-sm text-neutral-400"> / 月</span></p><p>{p.dailyCredits ? "每日 "+p.dailyCredits+" 點" : "每月 "+p.monthlyCredits.toLocaleString()+" 點"}</p><Link href={p.code==="free"?"/register":"/account"} className="mt-6 inline-block rounded-full bg-[#7ff0cd] px-5 py-2 text-sm text-black">{p.code==="free"?"免費註冊":"查看帳號與開通方式"}</Link></section>)}</div>
<h2 className="text-xl">增購點數</h2><div className="my-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{CREDIT_PACKS.map(p=><div key={p.code} className="rounded-xl border border-neutral-800 p-4"><p>{p.credits.toLocaleString()} 點</p><p className="mt-2 text-neutral-400">US$ {p.priceUSD}</p></div>)}</div>
<p className="text-sm leading-7 text-neutral-400">每日免費點數不累積；月方案點數依該期效期使用，未用完不結轉；增購點數自開通日起有效 730 天。每次生成的預估點數會顯示於創作頁面。</p>
</div></div>}
