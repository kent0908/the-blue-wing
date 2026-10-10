import { sql } from "./db";
import type { VercelPoolClient } from "@vercel/postgres";

export const MAX_CONCURRENT_VIDEO_JOBS = 4;

export async function countInFlightVideoJobs(userId: number, transaction?: Pick<VercelPoolClient, "query">): Promise<number> {
  const query = `
    select count(*)::int as n
    from credit_ledger cl
    where cl.user_id = $1
      and cl.reason = 'video'
      and cl.delta < 0
      -- A synchronous provider can finish without returning a pollable ID.
      -- The submit route writes this server-only terminal reference after persistence.
      and cl.ref not like 'completed:sync:%'
      -- Include the submission reservation before its provider ID is known.
      -- The caller can count under the same user-row lock as ledger insertion.
      -- Provider jobs expire after 24h; abandoned historical rows must not
      -- permanently consume a concurrent-generation slot. This is not a refund.
      and cl.created_at > now() - interval '24 hours'
      and not exists (select 1 from generations g where g.user_id = cl.user_id and g.ref = cl.ref)
      and not exists (
        select 1 from credit_ledger r
        where r.user_id = cl.user_id
          and ((r.reason = 'video_refund' and r.ref = cl.ref)
            or (r.reason = 'charge_refund' and r.ref = cl.id::text))
      )
      and not exists (
        select 1 from character_idle_videos v
        where v.user_id = cl.user_id and (v.job_id = cl.ref or v.charge_id = cl.id)
          and v.status in ('completed','failed')
      )
      and not exists (
        select 1 from character_scene_requests s
        where s.user_id = cl.user_id and s.job_id = cl.ref
          and s.status in ('completed','failed')
      )
      and not exists (
        select 1 from seedance_drafts d
        where d.user_id = cl.user_id
          and (((d.job_id = cl.ref or d.charge_id = cl.id) and d.status in ('completed','failed'))
            or ((d.final_job_id = cl.ref or d.final_charge_id = cl.id) and d.final_status in ('completed','failed')))
      )
  `;
  const { rows } = transaction ? await transaction.query(query, [userId]) : await sql.query(query, [userId]);
  return Number(rows[0]?.n ?? 0);
}

