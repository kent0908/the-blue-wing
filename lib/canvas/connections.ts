import { NODE_SPECS, type CanvasEdge, type CanvasGraph, type PortType } from "./types";

export interface CanvasPoint { x: number; y: number }
export interface ConnectionSource { fromNode: string; fromPort: string; portType: PortType; reconnectEdgeId?: string }
export interface ConnectionTarget { nodeId: string; portId: string; type: PortType }
export type ConnectionRejection = "missing" | "self" | "type" | "cycle";

export function connectionRejection(graph: CanvasGraph, source: ConnectionSource, target: ConnectionTarget): ConnectionRejection | null {
  const from = graph.nodes.find(node => node.id === source.fromNode);
  const to = graph.nodes.find(node => node.id === target.nodeId);
  if (!from || !to) return "missing";
  if (from.id === to.id) return "self";
  const output = NODE_SPECS[from.type].output;
  const input = NODE_SPECS[to.type].inputs.find(port => port.id === target.portId);
  if (output.id !== source.fromPort || !input || input.type !== output.type || target.type !== input.type) return "type";
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    // Replacing an input is atomic; the old edge must not create a false cycle.
    if (edge.id === source.reconnectEdgeId || (edge.toNode === target.nodeId && edge.toPort === target.portId)) continue;
    const next = adjacency.get(edge.fromNode) ?? [];
    next.push(edge.toNode); adjacency.set(edge.fromNode, next);
  }
  const visit = [to.id]; const seen = new Set<string>();
  while (visit.length) {
    const id = visit.pop()!;
    if (id === from.id) return "cycle";
    if (seen.has(id)) continue;
    seen.add(id); visit.push(...(adjacency.get(id) ?? []));
  }
  return null;
}

export function connectCanvasPorts(graph: CanvasGraph, source: ConnectionSource, target: ConnectionTarget, edgeId: string): CanvasGraph {
  if (connectionRejection(graph, source, target)) return graph;
  const retained = graph.edges.filter(edge => edge.id !== source.reconnectEdgeId && !(edge.toNode === target.nodeId && edge.toPort === target.portId));
  const edge: CanvasEdge = { id: edgeId, fromNode: source.fromNode, fromPort: source.fromPort, toNode: target.nodeId, toPort: target.portId };
  return { ...graph, edges: [...retained, edge] };
}

/** Distances are screen pixels, so magnetism stays consistent at every zoom. */
export function nearestCanvasPort<T extends CanvasPoint>(ports: readonly T[], point: CanvasPoint, zoom: number, radius = 28): T | null {
  if (!(zoom > 0) || !Number.isFinite(zoom) || !(radius >= 0) || !Number.isFinite(radius)
    || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  let nearest: T | null = null; let distance = radius * radius;
  for (const port of ports) {
    const squared = ((port.x - point.x) * zoom) ** 2 + ((port.y - point.y) * zoom) ** 2;
    if (squared <= distance) { distance = squared; nearest = port; }
  }
  return nearest;
}

/** A nearby incompatible socket must not mask a socket that can accept the wire. */
export function nearestConnectionTarget<T extends ConnectionTarget & CanvasPoint>(graph: CanvasGraph, source: ConnectionSource,
  ports: readonly T[], point: CanvasPoint, zoom: number, radius = 28): { hit: T | null; rejection: ConnectionRejection | null } {
  const nearby = ports.filter(port => Math.hypot(port.x - point.x, port.y - point.y) * zoom <= radius);
  const allowed = nearby.filter(port => !connectionRejection(graph, source, port));
  const hit = nearestCanvasPort(allowed.length ? allowed : nearby, point, zoom, radius);
  return { hit, rejection: hit ? connectionRejection(graph, source, hit) : null };
}

export function canvasConnectionPath(a: CanvasPoint, b: CanvasPoint): string {
  const handle = Math.max(50, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + handle} ${a.y}, ${b.x - handle} ${b.y}, ${b.x} ${b.y}`;
}

export function canvasPortKey(nodeId: string, portId: string): string { return JSON.stringify([nodeId, portId]); }
