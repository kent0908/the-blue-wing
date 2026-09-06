/** Replay immutable ledger events. Consume earliest-expiring grants first. */
export interface CreditEvent {
  id: string | number; delta: number; reason: string; ref: string | null;
  created_at: string | Date; expires_at: string | Date | null;
}
export function replayCredits(events: CreditEvent[], at = Date.now()) {
  const lots: {remaining:number; expires:number}[] = [];
  const allocations = new Map<string, {amount:number; lot:number}[]>();
  const refunded = new Set<string>();
  let debt = 0;
  for (const e of events) {
    const time = new Date(e.created_at).getTime();
    if (time > at) continue;
    const value = Number(e.delta);
    if (value > 0) {
      let source: string | undefined;
      if (e.reason === "charge_refund") source = e.ref ?? undefined;
      if (e.reason === "video_refund") source = String(events.find(x => x.reason === "video" && x.ref === e.ref && x.delta < 0)?.id ?? "");
      if (source && allocations.has(source)) {
        if (!refunded.has(source)) {
          for (const a of allocations.get(source)!) lots[a.lot].remaining += a.amount;
          refunded.add(source);
        }
      } else {
        const offset = Math.min(debt, value);
        debt -= offset;
        lots.push({ remaining:value-offset, expires:e.expires_at ? new Date(e.expires_at).getTime() : Infinity });
      }
    } else if (value < 0) {
      let need = -value;
      const used: {amount:number;lot:number}[] = [];
      for (const {lot,index} of lots.map((lot,index)=>({lot,index})).filter(x=>x.lot.expires>time).sort((a,b)=>a.lot.expires-b.lot.expires)) {
        const amount = Math.min(need,lot.remaining);
        if (amount) {lot.remaining-=amount;need-=amount;used.push({amount,lot:index});}
        if (!need) break;
      }
      debt += need;
      allocations.set(String(e.id),used);
    }
  }
  return lots.filter(l=>l.expires>at).reduce((s,l)=>s+l.remaining,0)-debt;
}
