const fs=require('fs');const p='components/CharacterScenes.tsx';let s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');s=s.replace('  avatarAssetId: number | null;','  avatarAssetId: number | null;\n  avatarReady?: boolean;\n  reason?: string;');s=s.replace('characterId, onClose }: { characterId: number; onClose: () => void','characterId, onClose, refreshKey }: { characterId: number; onClose: () => void; refreshKey?: number');s=s.replace('.then((r) => r.json())','.then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || "載入失敗"); return j; })').replace('.catch(() => setError("載入失敗"))','.catch((e) => setError(e instanceof Error ? e.message : "載入失敗"))').replace('  }, [characterId]);','  }, [characterId, refreshKey]);');const start=s.indexOf('  // Bounded the same way');const end=s.indexOf('  return (',start);s=s.slice(0,start)+`  const generate = async (kind: "image" | "video") => {
    if (!data || busy || !data.unlocked || !data.eligible) return;
    setError(null); setBusy(kind);
    setBusyLabel(kind === "image" ? "生成圖片場景中…" : "生成影片場景中…");
    try {
      const response = await fetch(\`/api/characters/\${characterId}/scenes\`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
      let result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "生成失敗");
      for (let i = 0; result.status === "processing" && i < 200; i++) {
        await new Promise(resolve => setTimeout(resolve, 4000));
        const poll = await fetch(\`/api/characters/\${characterId}/scenes?requestId=\${encodeURIComponent(result.requestId)}\`);
        const next = await poll.json();
        if (!poll.ok || next.status === "failed") throw new Error(next?.error?.message || "生成失敗");
        result = { ...next, requestId: result.requestId };
      }
      if (result.status !== "completed") throw new Error("生成仍在處理，請稍後重新查看場景");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "生成失敗"); }
    finally { setBusy(null); }
  };

`+s.slice(end);s=s.replace('disabled={!!busy}','disabled={!!busy || data.avatarReady === false}');s=s.replace('      <div className="flex-1 overflow-y-auto px-4 pb-6">','      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">\n        {error && <p role="alert" className="my-3 text-xs text-[#ff9b9b]">{error}</p>}\n        {data?.reason && <p className="my-3 text-xs text-[#a0aaa6]">{data.reason}</p>}');fs.writeFileSync(p,s);
