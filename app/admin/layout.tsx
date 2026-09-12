import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth";
import CrmShell from "@/components/crm/CrmShell";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login?next=/admin");
  const request = new NextRequest("https://internal.invalid/crm", {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
  const user = await getSessionUser(request);
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin" || !user.email_verified) redirect("/");
  return <CrmShell>{children}</CrmShell>;
}
