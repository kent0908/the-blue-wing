import { EN1 } from "./parts/p01";
import { EN2 } from "./parts/p02";
import { EN3 } from "./parts/p03";
import { EN4 } from "./parts/p04";
import { EN5 } from "./parts/p05";
import { EN6 } from "./parts/p06";
import { EN7 } from "./parts/p07";
import { EN8 } from "./parts/p08";
import { EN9 } from "./parts/p09";
import { EN10 } from "./parts/p10";
import { EN11 } from "./parts/p11";

/** Traditional Chinese source string → English. Split into parts by surface; scripts/check-i18n.cjs reports anything missing. */
export const EN: Record<string, string> = { ...EN1, ...EN2, ...EN3, ...EN4, ...EN5, ...EN6, ...EN7, ...EN8, ...EN9, ...EN10, ...EN11 };
