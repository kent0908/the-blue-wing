/** Identity marker for zh strings kept in module-level tables and translated later with tr(value) — lets scripts/check-i18n.cjs see them as keys. Dependency-free so lib modules can import it freely. */
export const k = (zh: string): string => zh;
