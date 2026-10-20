"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NODE_SPECS, NODE_WIDTH, NODE_HEADER_H, NODE_PORT_ROW_H, type CanvasGraph, type CanvasNode, type PortType } from "@/lib/canvas/types";
import { canvasConnectionPath, canvasPortKey, connectionRejection, nearestCanvasPort, type CanvasPoint, type ConnectionSource, type ConnectionTarget } from "@/lib/canvas/connections";
import styles from "./connections.module.css";

export const CONNECTION_COLORS: Record<PortType, string> = { text: "#7ea8ff", image: "#7ff0cd", video: "#f0b37f" };
export type PortOffsets = Record<string, CanvasPoint>;
export interface ConnectionSession extends ConnectionSource {
  startedAt: CanvasPoint;
  pointerId?: number;
  sequence: number;
}
export interface MeasuredTarget extends ConnectionTarget, CanvasPoint {}

export function measuredPortPosition(node: CanvasNode, portId: string, offsets?: PortOffsets): CanvasPoint {
  const offset = offsets?.[portId];
  if (offset) return { x: node.x + offset.x, y: node.y + offset.y };
  const spec = NODE_SPECS[node.type];
  if (portId === spec.output.id) return { x: node.x + (node.width ?? NODE_WIDTH), y: node.y + NODE_HEADER_H / 2 };
  return { x: node.x, y: node.y + NODE_HEADER_H + Math.max(0, spec.inputs.findIndex(port => port.id === portId)) * NODE_PORT_ROW_H + NODE_PORT_ROW_H / 2 };
}

export default function CanvasConnections({ graph, offsets, session, zoom, selectedEdge, toWorld, onComplete, onCancel, onHover, onSelect, onDelete, edgeLabel }: {
  graph: CanvasGraph;
  offsets: Map<string, PortOffsets>;
  session: ConnectionSession | null;
  zoom: number;
  selectedEdge: string | null;
  toWorld: (x: number, y: number) => CanvasPoint;
  onComplete: (source: ConnectionSource, target: ConnectionTarget) => void;
  onCancel: () => void;
  onHover: (target: string | null) => void;
  onSelect: (edgeId: string) => void;
  onDelete: (edgeId: string) => void;
  edgeLabel: string;
}) {
  const [preview, setPreview] = useState<{ point: CanvasPoint; invalid: boolean; sequence: number } | null>(null);
  const latest = useRef({ graph, offsets, zoom, toWorld, onComplete, onCancel, onHover });
  useEffect(() => { latest.current = { graph, offsets, zoom, toWorld, onComplete, onCancel, onHover }; });
  const nodes = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);

  useEffect(() => {
    if (!session) return;
    let frame = 0; let pointer: CanvasPoint | null = null; let moved = session.pointerId === undefined;
    let hover: string | null = null;
    const findTarget = (client: CanvasPoint) => {
      const current = latest.current;
      const point = current.toWorld(client.x, client.y);
      const candidates: MeasuredTarget[] = current.graph.nodes.flatMap(node => NODE_SPECS[node.type].inputs.map(port => ({
        nodeId: node.id, portId: port.id, type: port.type, ...measuredPortPosition(node, port.id, current.offsets.get(node.id)),
      })));
      const hit = nearestCanvasPort(candidates, point, current.zoom);
      const rejection = hit ? connectionRejection(current.graph, session, hit) : null;
      return { point, hit, rejection };
    };
    const update = () => {
      frame = 0;
      if (!pointer) return;
      const { point, hit, rejection } = findTarget(pointer);
      const nextHover = hit && !rejection ? canvasPortKey(hit.nodeId, hit.portId) : null;
      if (nextHover !== hover) { hover = nextHover; latest.current.onHover(hover); }
      // Only this SVG layer updates per animation frame; node editors remain untouched.
      setPreview({ point: hit && !rejection ? { x: hit.x, y: hit.y } : point, invalid: !!rejection, sequence: session.sequence });
    };
    const move = (event: PointerEvent) => {
      if (session.pointerId !== undefined && event.pointerId !== session.pointerId && event.buttons) return;
      if (Math.hypot(event.clientX - session.startedAt.x, event.clientY - session.startedAt.y) > 4) moved = true;
      pointer = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(update);
    };
    const up = (event: PointerEvent) => {
      if (session.pointerId !== undefined && event.pointerId !== session.pointerId) return;
      // A tap arms the source; a subsequent tap/keyboard activation chooses the input.
      if (!moved) return;
      const { hit } = findTarget({ x: event.clientX, y: event.clientY });
      if (hit) latest.current.onComplete(session, hit);
      else latest.current.onCancel();
    };
    const cancel = () => latest.current.onCancel();
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); cancel(); } };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", key);
    };
  }, [session]);

  const source = session ? nodes.get(session.fromNode) : null;
  const start = source && session ? measuredPortPosition(source, session.fromPort, offsets.get(source.id)) : null;
  const end = preview?.sequence === session?.sequence ? preview?.point : start;
  return <svg aria-label={edgeLabel} style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", pointerEvents: "none" }}>
    {graph.edges.map(edge => {
      const from = nodes.get(edge.fromNode); const to = nodes.get(edge.toNode);
      if (!from || !to) return null;
      const a = measuredPortPosition(from, edge.fromPort, offsets.get(from.id));
      const b = measuredPortPosition(to, edge.toPort, offsets.get(to.id));
      const color = CONNECTION_COLORS[NODE_SPECS[from.type].output.type];
      const selected = selectedEdge === edge.id; const path = canvasConnectionPath(a, b);
      return <g key={edge.id} data-canvas-edge={edge.id}>
        <path d={path} fill="none" stroke="transparent" strokeWidth={16 / zoom} className={styles.edgeHit}
          tabIndex={0} role="button" aria-label={`${edgeLabel}${String(from.data.title || from.id)} → ${String(to.data.title || to.id)}`}
          aria-pressed={selected} onPointerDown={event => { event.stopPropagation(); onSelect(edge.id); }}
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(edge.id); }
            if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); event.stopPropagation(); onDelete(edge.id); }
          }} />
        <path d={path} fill="none" stroke={selected ? "#f0b37f" : color} strokeWidth={selected ? 2.6 : 1.7} vectorEffect="non-scaling-stroke" opacity={selected ? 1 : .64} />
        {[.18, .5, .82].map((progress, index) => {
          const handle = Math.max(50, Math.abs(b.x - a.x) / 2); const rest = 1 - progress;
          const x = rest ** 3 * a.x + 3 * rest ** 2 * progress * (a.x + handle) + 3 * rest * progress ** 2 * (b.x - handle) + progress ** 3 * b.x;
          const y = rest ** 3 * a.y + 3 * rest ** 2 * progress * a.y + 3 * rest * progress ** 2 * b.y + progress ** 3 * b.y;
          return <g key={index}>
            <circle className={styles.movingDot} r={2.6 / zoom} fill={color}><animateMotion dur="3s" begin={`${-index}s`} repeatCount="indefinite" path={path} /></circle>
            <circle className={styles.stillDot} cx={x} cy={y} r={2.6 / zoom} fill={color} />
          </g>;
        })}
        {[a, b].map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={3 / zoom} fill={color} stroke="#11201b" strokeWidth={1 / zoom} />)}
      </g>;
    })}
    {session && start && end && <path data-canvas-connection-preview="true" d={canvasConnectionPath(start, end)} fill="none"
      stroke={preview?.sequence === session.sequence && preview.invalid ? "#ff9b9b" : CONNECTION_COLORS[session.portType]}
      strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray="6 4" />}
  </svg>;
}
