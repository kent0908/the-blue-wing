/** Replay immutable ledger events. Consume earliest-expiring grants first. */
export interface CreditEvent {
  id: string | number; delta: number; reason: string; ref: string | null;
  created_at: string | Date; expires_at: string | Date | null;
}
export function replayCredits(events: CreditEvent[], at = Date.now()) {
  const lots: {remaining:number; expires:number}[] = [];
  // remaining is the portion of this charge's original allocation not yet returned.
  const allocations = new Map<string, {remaining:number; lot:number}[]>();
  const seenEvents = new Set<string>();
  let debt = 0;
  for (const e of events) {
    const time = new Date(e.created_at).getTime();
    if (time > at || seenEvents.has(String(e.id))) continue;
    seenEvents.add(String(e.id));
    const value = Number(e.delta);
    if (value > 0) {
      let source: string | undefined;
      const isRefund = e.reason === 'charge_refund' || e.reason === 'charge_partial_refund' || e.reason === 'video_refund';
      if (e.reason === 'charge_refund' || e.reason === 'charge_partial_refund') source = e.ref ?? undefined;
      if (e.reason === 'video_refund') source = String(events.find(x => x.reason === 'video' && x.ref === e.ref && x.delta < 0)?.id ?? '');
      if (isRefund) {
        // An orphan refund must never become a new perpetual grant.
        const used = source ? allocations.get(source) : undefined;
        if (!used) continue;
        let returned = value;
        // Undo the last reserved credits first, leaving the actual cost in the
        // earliest-expiring grants. Keep original expiries, even if expired now.
        for (let i=used.length-1; i>=0 && returned>0; i--) {
          const allocation=used[i];
          const amount=Math.min(returned,allocation.remaining);
          allocation.remaining-=amount;returned-=amount;
          if(allocation.lot>=0) lots[allocation.lot].remaining+=amount;
          else {
            const offset=Math.min(debt,amount);debt-=offset;
            if(amount>offset)lots.push({remaining:amount-offset,expires:Infinity});
          }
        }
      } else {
        const offset = Math.min(debt, value);
        debt -= offset;
        lots.push({ remaining:value-offset, expires:e.expires_at ? new Date(e.expires_at).getTime() : Infinity });
      }
    } else if (value < 0) {
      let need = -value;
      const used: {remaining:number;lot:number}[] = [];
      for (const {lot,index} of lots.map((lot,index)=>({lot,index})).filter(x=>x.lot.expires>time).sort((a,b)=>a.lot.expires-b.lot.expires)) {
        const amount = Math.min(need,lot.remaining);
        if (amount) {lot.remaining-=amount;need-=amount;used.push({remaining:amount,lot:index});}
        if (!need) break;
      }
      debt += need;
      if(need)used.push({remaining:need,lot:-1});
      allocations.set(String(e.id),used);
    }
  }
  return lots.filter(l=>l.expires>at).reduce((s,l)=>s+l.remaining,0)-debt;
}
