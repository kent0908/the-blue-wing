/** Offline contract only. No network, database writes, or authority over chat. */
export const DECISION_VERSION = "companion-shadow-v1";
export const EVENT_STATES = ["none", "proposed", "in_progress", "completed", "uncertain"] as const;
export type EventState = typeof EVENT_STATES[number];
export interface DecisionResult {
  model: string;
  event: EventState;
  confidence: number;
  probabilities: Record<EventState, number>;
  memoryProbability: number;
  inputTokens: number;
}
export interface DecisionEvaluator {
  evaluate(state: { relationship: string; recent: { role: "user" | "assistant"; content: string }[] }): Promise<DecisionResult>;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("invalid_response");
  return value as Record<string, unknown>;
}
function probability(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw Error("invalid_response");
  return value;
}
export function parseDecision(value: unknown): DecisionResult {
  const body = record(value), answers = record(body.answers), event = record(answers.event), memory = record(answers.memory);
  if (event.type !== "choice" || !EVENT_STATES.includes(event.choice as EventState) || memory.type !== "noul") throw Error("invalid_response");
  const raw = record(event.probabilities);
  const probabilities = Object.fromEntries(EVENT_STATES.map(key => [key, probability(raw[key])])) as Record<EventState, number>;
  if (Math.abs(Object.values(probabilities).reduce((a,b) => a+b,0)-1) > 0.01) throw Error("invalid_response");
  const usage = record(body.usage);
  if (!Number.isSafeInteger(usage.input_tokens) || (usage.input_tokens as number) < 0 || typeof body.model !== "string" || !body.model || body.model.length > 100) throw Error("invalid_response");
  return { model: body.model, event: event.choice as EventState, probabilities, confidence: probability(event.confidence), memoryProbability: probability(memory.noul), inputTokens: usage.input_tokens as number };
}
/** Recommendations remain review-only, even at high confidence. */
export function reviewDecision(result: DecisionResult) {
  return { eventCandidate: result.confidence >= 0.9 ? result.event : "uncertain", memoryCandidate: result.memoryProbability >= 0.9, applyAutomatically: false as const };
}
