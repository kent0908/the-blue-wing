import { notFound } from "next/navigation";
import { builtinCanvasTemplate } from "@/lib/canvas/officialTemplates";
import CanvasTemplatePreview from "@/components/canvas/CanvasTemplatePreview";
export default async function Page({params}:{params:Promise<{id:string}>}) {
 const {id}=await params; const template=builtinCanvasTemplate(Number(id));
 if(!template)notFound();
 return <CanvasTemplatePreview template={template}/>;
}
