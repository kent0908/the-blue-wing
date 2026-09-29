/**
 * How much of a companion conversation rides along on each turn.
 *
 * The old rule was a flat 20 messages, chosen to keep the prompt from growing
 * unbounded. Measured on the live gateway 2026-09-27, that was leaving almost
 * all of the available memory on the table, and the reason it was capped so low
 * no longer holds:
 *
 *   history   prompt tokens   of which cached
 *   20        548             0
 *   60        1,236           0
 *   200       3,644           3,187  (87%)
 *
 * SIRAYA serves prompt caching automatically, with no header and no cache API
 * call — deepseek-v4.1-flash hit 80%, gemini-3.5-flash 87%, grok 99.7%. A
 * companion chat is the ideal shape for it: the prefix (system prompt + every
 * earlier message) never changes, each turn only appends. So depth costs almost
 * nothing on any turn that follows another within the cache window:
 *
 *   gemini-3.5-flash, 200 messages, warm:  $0.0033/turn  (vs $0.0029 at 20)
 *   gemini-3.5-flash, 200 messages, cold:  $0.0076/turn
 *
 * The cold number is what sets the bound. At 3 credits ($0.03) a turn, 200
 * messages leaves a 3.9x margin on a cache miss — just under the ≥4x floor this
 * project prices to. So the budget is tokens, not messages: it self-regulates
 * when someone writes long messages, where a message count would not, and it is
 * set to keep even a cold turn at roughly 4.5x.
 *
 * Nothing here drops memory that used to be kept: the rolling summary
 * (MEMORY_REFRESH_EVERY) still carries everything older than the window, and
 * the window is now ~7x deeper than it was.
 */

/**
 * Characters per token for this content, deliberately pessimistic.
 *
 * Traditional Chinese runs about 1 token per character on these tokenizers —
 * measured 3,846 tokens for a 200-message history whose messages average ~19
 * tokens. Latin text is cheaper (~4 chars/token), so assuming 1 makes the
 * estimate an upper bound for mixed content and never under-budgets.
 */
const CHARS_PER_TOKEN = 1;

/** Envelope cost of a message: role, separators, JSON quoting. */
const PER_MESSAGE_OVERHEAD_TOKENS = 4;

/**
 * Token budget for the recent-message window alone.
 *
 * Excludes the system prompt (~1k) and the reply itself; those are accounted
 * for in the margin figure above. 3,000 fits roughly 150 short messages.
 */
export const HISTORY_TOKEN_BUDGET = 3_000;

/**
 * Hard ceiling on rows fetched, so one pathological conversation cannot turn
 * into an unbounded query. Well above what the token budget will ever admit.
 */
export const HISTORY_FETCH_LIMIT = 400;

export interface BudgetedMessage { role: string; content: string }

export function estimateTokens(content: string): number {
  return Math.ceil(String(content ?? "").length / CHARS_PER_TOKEN) + PER_MESSAGE_OVERHEAD_TOKENS;
}

/**
 * Keep the newest messages that fit the budget, in their original order.
 *
 * Walks from the newest backwards — the recent turns are the ones that matter
 * for coherence, and the older ones are already in the rolling summary. The
 * newest message is always kept even if it alone exceeds the budget: dropping
 * it would answer a turn the model cannot see.
 */
export function withinHistoryBudget<T extends BudgetedMessage>(
  messages: T[],
  budget = HISTORY_TOKEN_BUDGET
): T[] {
  let used = 0;
  let start = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimateTokens(messages[i].content);
    if (used + cost > budget && start < messages.length) break;
    used += cost;
    start = i;
  }
  return messages.slice(start);
}
