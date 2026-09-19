import { sql } from "./db";
import { decodeStoryMessage } from "./officialCompanionStory";
import { DECISION_VERSION, reviewDecision } from "./companionDecision";
import { decisionEnabled, jevEvaluator } from "./companionDecisionProvider";
/** Best-effort shadow telemetry, never writes to character state or the credit ledger. */
export async function recordDecisionShadow(characterId: number, messageId: number) {
  if (!decisionEnabled(messageId)) return;
  let claimed = false;
  const started = Date.now();
  try {
    // Ownership linkage is checked in SQL as well as by the authenticated caller.
    const claim = await sql`insert into companion_decision_evaluations (message_id, character_id, policy_version, status)
      select id, character_id, ${DECISION_VERSION}, 'pending' from character_messages
      where id = ${messageId} and character_id = ${characterId} and role = 'assistant'
      on conflict (message_id, policy_version) do nothing returning message_id`;
    if (!claim.rows.length) return;
    claimed = true;
    const [profile, messages] = await Promise.all([
      sql`select profile from characters where id = ${characterId}`,
      sql`select role, content from character_messages where character_id = ${characterId} and id <= ${messageId} order by id desc limit 6`
    ]);
    if (!profile.rows.length) return; // Character deletion also cascades the claim.
    const recent = messages.rows.reverse().map(row => ({ role: row.role as "user" | "assistant", content: String(row.role === "assistant" ? decodeStoryMessage(String(row.content))?.reply ?? row.content : row.content).slice(0,1800) }));
    const result = await jevEvaluator.evaluate({ relationship: String(profile.rows[0].profile?.relationship ?? "").slice(0,500), recent });
    const snapshot = { ...result, review: reviewDecision(result), estimatedCostUsd: result.inputTokens * 0.042 / 1000000, inputUsdPerMillion: 0.042 };
    await sql`update companion_decision_evaluations set status = 'completed', result = ${JSON.stringify(snapshot)}::jsonb, duration_ms = ${Date.now()-started}
      where message_id = ${messageId} and policy_version = ${DECISION_VERSION}`;
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    const code = /^http_\d{3}$/.test(raw) || raw === "invalid_response" ? raw : "evaluation_failed";
    if (claimed) {
      try { await sql`update companion_decision_evaluations set status = 'failed', error_code = ${code}, duration_ms = ${Date.now()-started} where message_id = ${messageId} and policy_version = ${DECISION_VERSION}`; } catch { /* Do not fail chat. */ }
    }
    console.warn("companion_decision_shadow_failed", { code });
  }
}
