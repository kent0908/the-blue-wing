import { validateGraph } from "./validation";
import { officialCharacter } from "./officialCharacters";
export function shareableGraph(value: unknown) {
 const graph = validateGraph(value);
 const remaining = new Set(graph.nodes.map(n => n.id));
 while (remaining.size) { const ready = [...remaining].filter(id => !graph.edges.some(e => e.toNode === id && remaining.has(e.fromNode))); if (!ready.length) throw new Error("工作流不可包含循環連線"); ready.forEach(id => remaining.delete(id)); }
 return { edges: graph.edges, nodes: graph.nodes.map(n => {
  const allowed = n.type === "text" ? ["text","title"] : n.type === "loadImage" ? ["title","officialCharacter"] : n.type === "director3d" ? ["title", "characters", "ground", "background", "camera"] : ["title","model","prompt","size","quality","seconds","resolution","aspect_ratio"];
  const data = Object.fromEntries(Object.entries(n.data).filter(([k]) => allowed.includes(k)));
  if (n.type === "loadImage") { data.items = []; if (!officialCharacter(data.officialCharacter)) delete data.officialCharacter; }
  if (n.type === "text" && n.data.directorStory === true) data.directorStory = true;
  if (n.type === "video") {
    const { shotTitle, shotOrder } = n.data;
    if (typeof shotTitle === "string" && shotTitle.length <= 120) data.shotTitle = shotTitle;
    if (typeof shotOrder === "number" && Number.isSafeInteger(shotOrder) && shotOrder >= 0 && shotOrder < 200) data.shotOrder = shotOrder;
  }
  return { id:n.id, type:n.type, x:n.x, y:n.y, ...(n.width ? {width:n.width}:{}), ...(n.textHeight ? {textHeight:n.textHeight}:{}), data };
 }) };
}
