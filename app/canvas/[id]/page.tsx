"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import CanvasEditor from "@/components/canvas/CanvasEditor";
import type { CanvasGraph } from "@/lib/canvas/types";

interface WorkflowData {
  id: string;
  name: string;
  graph: CanvasGraph;
}

export default function CanvasWorkflowPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<WorkflowData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/canvas/${params.id}`)
      .then((r) => {
        if (r.status === 401) {
          router.push(`/login?next=/canvas/${params.id}`);
          return null;
        }
        return r.ok ? r.json() : Promise.reject(new Error("找不到這個畫布"));
      })
      .then((j: { workflow: WorkflowData } | null) => {
        if (!alive || !j) return;
        const graph = j.workflow.graph && Array.isArray(j.workflow.graph.nodes) ? j.workflow.graph : { nodes: [], edges: [] };
        setData({ id: j.workflow.id, name: j.workflow.name, graph });
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "載入失敗"));
    return () => {
      alive = false;
    };
  }, [params.id, router]);

  if (error) {
    return (
      <div className="grid h-full place-items-center">
        <div className="max-w-sm rounded-xl border border-[#4a2020] bg-[#1a1010] px-5 py-4 text-center text-[13.5px] text-[#ffb4b4]">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid h-full place-items-center">
        <div className="bw-shimmer h-8 w-8 rounded-full" />
      </div>
    );
  }

  return <CanvasEditor workflowId={data.id} initialName={data.name} initialGraph={data.graph} />;
}
