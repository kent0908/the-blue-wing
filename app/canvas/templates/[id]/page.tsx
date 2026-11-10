import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { builtinCanvasTemplate } from "@/lib/canvas/officialTemplates";
import CanvasTemplatePreview from "@/components/canvas/CanvasTemplatePreview";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/tr";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, locale] = await Promise.all([params, getLocale()]);
  const template = builtinCanvasTemplate(Number(id), locale);
  if (!template) return {};
  const canonical = `/canvas/templates/${template.id}`;
  const title = translate(locale, template.name);
  const description = translate(locale, template.description);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
  };
}

export default async function Page({ params }: Props) {
  const [{ id }, locale] = await Promise.all([params, getLocale()]);
  const template = builtinCanvasTemplate(Number(id), locale);
  if (!template) notFound();
  return <CanvasTemplatePreview template={template} />;
}
