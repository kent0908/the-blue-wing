import type { CanvasGraph, CanvasNode } from "./types";

export interface ShotNotes { action?: string; camera?: string; sound?: string; continuity?: string }
export function shotPrompt(prompt: string, notes: unknown): string {
  const n = notes && typeof notes === "object" ? notes as ShotNotes : {};
  return [prompt, ...([['action', '角色與動作'], ['camera', '構圖與運鏡'], ['sound', '聲音與節奏'], ['continuity', '前後鏡銜接']] as const).map(([key, label]) => typeof n[key] === 'string' && n[key]?.trim() ? `${label}：${n[key].trim()}` : '')].filter(Boolean).join('\n\n');
}
export function orderedShots(graph: CanvasGraph): CanvasNode[] {
  return graph.nodes.filter(n => n.type === 'video').map((node, index) => ({node, index})).sort((a,b) => (Number(a.node.data.shotOrder ?? a.index) - Number(b.node.data.shotOrder ?? b.index)) || a.index-b.index).map(x=>x.node);
}
function generationData(node: CanvasNode) {
  const data = { ...node.data };
  delete data.shotOrder; delete data.shotTitle;
  return JSON.stringify(data);
}
/** Invalidate changed inputs and descendants; preserve independent takes and metadata-only edits. */
export function invalidateChanged(previous: CanvasGraph, next: CanvasGraph): CanvasGraph {
  const old = new Map(previous.nodes.map(n=>[n.id,n]));
  const incoming = (g: CanvasGraph, id: string) => JSON.stringify(g.edges.filter(e=>e.toNode===id).map(e=>[e.fromNode,e.fromPort,e.toPort]).sort());
  const affected = new Set(next.nodes.filter(n => !old.has(n.id) || generationData(n)!==generationData(old.get(n.id)!) || incoming(previous,n.id)!==incoming(next,n.id)).map(n=>n.id));
  let grew = true;
  while(grew) { grew=false; for(const e of next.edges) if(affected.has(e.fromNode)&&!affected.has(e.toNode)){affected.add(e.toNode);grew=true;} }
  return {...next,nodes:next.nodes.map(n=>affected.has(n.id)?{...n,status:'idle',output:null,error:null}:n)};
}
/** Only rerun the chosen shot and unresolved dependencies. Never silently rerun a completed paid upstream node. */
export function plannedShotRun(graph: CanvasGraph, id: string): string[] {
  const visited=new Set<string>(), visiting=new Set<string>(), order:string[]=[];
  function visit(key:string, force=false) {
    if(visiting.has(key)) throw new Error('流程包含循環連線');
    if(visited.has(key)) return;
    const node=graph.nodes.find(n=>n.id===key);
    if(!node) throw new Error('分鏡不存在');
    if(!force && node.status==='done' && node.output) {visited.add(key);return;}
    visiting.add(key);
    graph.edges.filter(e=>e.toNode===key).forEach(e=>visit(e.fromNode));
    visiting.delete(key);visited.add(key);order.push(key);
  }
  visit(id,true);return order;
}

/** Deterministic manual scene splitting; no model call or inferred story changes. */
export function storyParagraphs(text: string): string[] {
  return text.trim().split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean);
}
