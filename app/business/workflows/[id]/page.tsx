import type { Metadata } from "next";
import BusinessWorkflowEditor from "@/components/business/BusinessWorkflowEditor";
import { businessWorkflowsCopy } from "@/lib/i18n/businessWorkflows";
import { getLocale } from "@/lib/i18n/server";
import { NOINDEX } from "@/lib/seo/site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: businessWorkflowsCopy(await getLocale()).nav, ...NOINDEX };
}
export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  return <BusinessWorkflowEditor id={(await params).id} />;
}
