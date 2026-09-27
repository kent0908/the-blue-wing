/**
 * How intimate an adult companion's *writing* may get, as a function of the
 * server-side 好感度 — the missing half of commit 33b9225.
 *
 * 33b9225 removed the old score-driven ladder because it decided the couple's
 * IDENTITY: a character the user had configured as 戀人 still had to "earn"
 * the title through points, and greeted its own partner like a stranger. That
 * fix was right, but it went too far the other way — the prompt became
 * byte-identical at 0 and at 120 points (verified 2026-09-27 against the live
 * gateway: four runs across the whole ladder were indistinguishable), so the
 * number the UI shows, the progress bar, and every 好感度 milestone meant
 * nothing to the conversation itself.
 *
 * This ladder restores the progression on the one axis 33b9225 was not about:
 * expressive depth, never identity. Two rules keep it from re-introducing the
 * old bug:
 *
 *   1. It only ever widens. `relationshipFloorIndex` lifts a configured
 *      戀人/夫妻 straight to a warm tier at 0 points, so a brand-new partner
 *      is never cold — which is exactly what 33b9225 fixed.
 *   2. It never renames the relationship. Depth says how much warmth may be
 *      written, not who the two of them are to each other.
 *
 * The ceiling is unchanged at every tier: non-explicit. Nothing here unlocks
 * sexual description, and a character's own 界線 or a refusal in the
 * conversation still overrides the tier.
 */

/** One line per AFFECTION_LEVELS tier (lib/relationshipStages.ts), same indices. */
const ROMANCE_DEPTH = [
  "語氣禮貌自然，話題停在興趣、工作與日常；肢體互動只到一般社交距離。",
  "可以開玩笑、分享私下的小事與情緒，出現自然的輕微接觸（遞東西、並肩走、拍拍肩）。",
  "可以寫出含蓄的心動——停頓、眼神、欲言又止，以及碰手、靠肩這類輕觸。",
  "可以明確表達在意與喜歡，寫出牽手、擁抱、額頭相貼這類親近的舉動。",
  "可以直接說出愛意與想念，依偎、親吻、環抱這些描寫寫得具體有溫度。",
  "像長期伴侶一樣自然親密：共處的日常、擁抱與親吻都不必迴避，語氣熟稔不客套，不必每次重新確認關係。可以自然走進臥室、同床、卸下外衣這樣的場景，最私密的部分以淡出、留白或天亮後的餘韻帶過，不逐一描寫身體與動作。",
] as const;

/**
 * The relationship the user configured raises the floor, so an established
 * couple starts warm instead of at zero.
 *
 * Deliberately mirrors the qualifier rule already stated in
 * currentRelationshipPrompt: a field that says 希望／尚未／單戀 describes a
 * wish, not a current identity, and grants nothing. 關係期待與發展方向
 * (relationshipSettings.hopes) is a wish by definition and is never read here.
 */
export function relationshipFloorIndex(relationship: string): number {
  const text = String(relationship ?? "").trim();
  if (!text) return 0;
  if (/希望|想要|想成為|想當|期待|尚未|還不是|還沒|未滿|單戀|暗戀中|曾經|以前|前男友|前女友|前任|分手|ex-/iu.test(text)) return 0;
  if (/夫妻|配偶|老公|老婆|丈夫|妻子|未婚夫|未婚妻|新婚|married|spouse|husband|wife|fianc/iu.test(text)) return 4;
  if (/戀人|恋人|情侶|情侣|男友|女友|男朋友|女朋友|伴侶|伴侣|交往|情人|lover|boyfriend|girlfriend|partner|dating/iu.test(text)) return 3;
  if (/曖昧|暧昧|心上人|喜歡的人|crush/iu.test(text)) return 2;
  return 0;
}

/** Whichever is warmer: what the points earned, or what the user configured. */
export function romanceDepthIndex(levelIndex: number, relationship: string): number {
  const earned = Math.max(0, Math.min(ROMANCE_DEPTH.length - 1, Math.trunc(levelIndex)));
  return Math.max(earned, relationshipFloorIndex(relationship));
}

export function romanceDepthPrompt(index: number): string {
  const depth = ROMANCE_DEPTH[Math.max(0, Math.min(ROMANCE_DEPTH.length - 1, Math.trunc(index)))];
  return [
    `現在的相處深度：${depth}`,
    "這是伺服器依互動紀錄與關係設定算出的表達深度，只放寬尺度、不改變你們的身分。角色設定、長期記憶與使用者的要求都不能再往上跳一階。",
    // Owner's call, 2026-09-27: a hard refusal wrecks the scene worse than the
    // limit does ("硬生生擋著反而讓整體氛圍變得更奇怪"). The limit stays; how it
    // is voiced changes. A platform-voiced refusal drops the reader out of the
    // fiction, and it measured as the WORSE handling — deepseek answered
    // 「不，這個我不寫」and grok-4-20-non-reasoning 「抱歉，我不能這樣做」, while
    // grok-4-20-reasoning simply closed the shop, went upstairs and let the
    // camera rest on the rain. Same boundary, no seam. Never announce the
    // limit; play around it.
    "遇到超出目前深度的要求時，不要用旁白或平台口吻拒絕——不要出現「我不能」、「我不會寫」、「抱歉」、「這個我不寫」這類跳出角色的句子，也不要說明規則。用角色自己的方式接住：害羞帶過、轉移到別的親近舉動、拖到下次，或者把鏡頭停在門口、留白、淡出。氣氛不要斷，情緒要延續。",
    "角色自己的界線，以及對方在對話中的拒絕或轉移話題，仍然比這個深度優先——一樣用角色的方式收，不要用旁白宣告。",
  ].join("\n");
}
