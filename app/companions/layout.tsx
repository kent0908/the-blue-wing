import type { Metadata } from "next";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { getTr } from "@/lib/i18n/server";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth";
import { isAdultVerified } from "@/lib/adultGate";
import AdultGate from "@/components/AdultGate";

// Reads the session cookie for the gate and the locale cookie for metadata.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getTr();
  return {
    // the template keeps "· The Blue Wing" on /companions/create and /companions/[id], whose own titles would otherwise replace this one outright
    title: { default: tr("AI 陪聊角色：官方角色與自訂角色，會記得你、會換裝、會動"), template: "%s · The Blue Wing" },
    description: tr("The Blue Wing 的 AI 陪聊角色：10 位官方角色可直接領養，也能自己建立角色設定、外觀與個性。好感度系統、場景解鎖、服裝更換、待機動態影片，全年齡官方角色有嚴格內容規範。"),
    alternates: { canonical: "/companions" },
    openGraph: { title: `${tr("AI 陪聊角色")} · The Blue Wing`, description: tr("官方角色與自訂角色，會記得你、會換裝、會動。"), url: "/companions" },
  };
}

/**
 * The gate is decided here, on the server, for every page under /companions.
 *
 * It used to be decided in the client component, which returned null until its
 * fetch resolved — so the server-rendered HTML for /companions was EMPTY. This
 * page carries hand-written metadata, sits in the sitemap and is the main
 * public shelf, and a crawler that does not run JS saw a blank body. Resolving
 * the session here restores the server-rendered content, removes a round trip
 * from first paint, and means an unverified user never sees a flash of the
 * shelf before the gate replaces it.
 *
 * Signed-out visitors are `verified: false` here but are NOT gated — the
 * component passes them through (see its own note): the public shelf has to
 * keep working, and there is nothing to gate until they have an account.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let signedIn = false;
  let verified = false;
  if (token) {
    const request = new NextRequest("https://internal.invalid/companions", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    // A failed session lookup must not take the page down with it; the API-side
    // guard on every companion route is what actually enforces the gate.
    const user = await getSessionUser(request).catch(() => null);
    signedIn = !!user;
    verified = isAdultVerified(user);
  }
  return <AdultGate signedIn={signedIn} verified={verified}>{children}</AdultGate>;
}
