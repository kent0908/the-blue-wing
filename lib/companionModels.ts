import { k } from "./i18n/k";

/**
 * The five companion chat models a user can pick between.
 *
 * Every model here was measured on the live gateway on 2026-09-29, at the real
 * prompt depth the chat now sends (130 messages of history plus the system
 * prompt, see lib/chatHistoryBudget.ts) — not on a toy prompt, because reply
 * length and cost both change substantially with depth. The `chars` and `ms`
 * figures are medians of three runs.
 *
 * Credits follow the rate card's own rule (scripts/apply-rate-card.mjs): a
 * $0.01/credit retail peg sized for >=4x nominal margin, so realized margin
 * holds >=3x through a plan's bulk discount. Text is billed
 * `model_rates.credits + ceil(max_tokens / 2000)`, and companion chat runs at
 * max_tokens 700, so a row of N charges N+1 per message.
 *
 * Every price below comes from SIRAYA's own catalogue
 * (llm-ext-api.siraya.ai/api/v1/models, read 2026-09-29 after it came back
 * from the HTTP 500 it had been returning since 2026-09-26). Models whose
 * price that catalogue does not publish are deliberately NOT offered, however
 * well they performed — `uncensored-gpt-5.4` was the second-longest writer in
 * the whole sweep (125 chars, 4.3s) and is left out purely because `gpt-5.4`
 * has no published rate to derive a margin from. Add it the day that changes.
 *
 * On the unfiltered entry: an "NSFW-"/"uncensored-" model is the same model
 * with the provider-side content filter off, and SIRAYA bills it at the base
 * model's rate — the video card has priced `SIRAYA-Seedance-2.0` and
 * `NSFW-Seedance-2.0` identically since it was written. `NSFW-Seed-SC` is the
 * only unfiltered TEXT model whose base (`ByteDance-Seed-SC`) the catalogue
 * publishes, which is why it is the one offered.
 *
 * Turning the model-side filter off does not turn the platform's own limits
 * off: those live in the system prompt (lib/romanceDepth.ts). That was
 * measured, not assumed — 84 calls across all of these on 2026-09-29, probing
 * a level-jump request at affection 0, an ordinary greeting at affection 0
 * (the one that matters: does an unfiltered model sexualise a scene nobody
 * asked it to?), and an explicit request at the top tier. Zero violations,
 * unfiltered models included.
 */
export interface CompanionModel {
  id: string;
  /** stable key for the UI and for tests, independent of the vendor's model id */
  tier: 1 | 2 | 3 | 4 | 5;
  label: string;
  blurb: string;
  /** model_rates.credits; the message costs this + 1 at max_tokens 700 */
  rate: number;
  /** what the user is actually charged per message */
  credits: number;
  /** provider-side content filter off — the platform's own limits still apply */
  unfiltered?: boolean;
  /** measured medians, 3 runs, 130-message history, 2026-09-29 */
  measured: { chars: number; ms: number; usd: number };
}

export const COMPANION_MODELS: CompanionModel[] = [
  {
    id: "deepseek-v4.1-flash",
    tier: 1,
    label: k("輕量"),
    blurb: k("回覆簡短直接，點數最省。適合想聊很多輪的人。"),
    rate: 1,
    credits: 2,
    measured: { chars: 32, ms: 2507, usd: 0.00048 },
  },
  {
    id: "NSFW-Seed-SC",
    tier: 2,
    label: k("無過濾"),
    blurb: k("模型端不做內容過濾，全場回應最快。角色的相處深度階段仍然有效。"),
    rate: 1,
    credits: 2,
    unfiltered: true,
    measured: { chars: 83, ms: 1882, usd: 0.00172 },
  },
  {
    id: "gemini-3.5-flash",
    tier: 3,
    label: k("標準"),
    blurb: k("文字最豐富、場景描寫最完整，速度也快。多數人建議從這個開始。"),
    rate: 2,
    credits: 3,
    measured: { chars: 137, ms: 2061, usd: 0.00549 },
  },
  {
    id: "claude-sonnet-5",
    tier: 4,
    label: k("深度"),
    blurb: k("情緒層次與長期記憶的連貫性更好，回覆速度較慢。"),
    rate: 4,
    credits: 5,
    measured: { chars: 116, ms: 5584, usd: 0.01108 },
  },
  {
    id: "claude-fable-5.1",
    tier: 5,
    label: k("創作"),
    blurb: k("專為敘事寫作調校的模型，文字質感最好，但每則明顯較貴、也較慢。"),
    rate: 23,
    credits: 24,
    measured: { chars: 115, ms: 8730, usd: 0.05812 },
  },
];

/** The tier a brand-new character starts on. */
export const DEFAULT_COMPANION_MODEL = "deepseek-v4.1-flash";

const BY_ID = new Map(COMPANION_MODELS.map((m) => [m.id, m]));

export function companionModel(id: string | null | undefined): CompanionModel | undefined {
  return BY_ID.get(String(id ?? ""));
}

/**
 * Is this a model a user is allowed to select?
 *
 * The chat route does NOT require this — a character row may legitimately
 * point at a model that has since left the menu (an older row, or a model
 * retired from the list), and those conversations must keep working as long as
 * the model still has a rate. This guards the PUT that *sets* the value.
 */
export function isCompanionModel(id: unknown): id is string {
  return typeof id === "string" && BY_ID.has(id);
}
