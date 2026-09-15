import { JA1 } from "./parts/p01";
import { JA2 } from "./parts/p02";
import { JA3 } from "./parts/p03";
import { JA4 } from "./parts/p04";
import { JA5 } from "./parts/p05";
import { JA6 } from "./parts/p06";
import { JA7 } from "./parts/p07";
import { JA8 } from "./parts/p08";
import { JA9 } from "./parts/p09";
import { JA10 } from "./parts/p10";
import { JA11 } from "./parts/p11";

/** Traditional Chinese source string → Japanese. Split into parts by surface; scripts/check-i18n.cjs reports anything missing. */
export const JA: Record<string, string> = { ...JA1, ...JA2, ...JA3, ...JA4, ...JA5, ...JA6, ...JA7, ...JA8, ...JA9, ...JA10, ...JA11 };
