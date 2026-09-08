import LayerDecompositionResult from "@/components/LayerDecompositionResult";
export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return <LayerDecompositionResult id={id}/>;
}
