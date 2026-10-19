/** Vendor-published reference tariffs read from SIRAYA Console on 2026-10-19.
 * They are not actual invoices. Ambiguous overlapping rules remain ranges.
 * Only the site's image/text-input modes are covered; source-video billing is excluded.
 */
export interface VideoProviderTariff { resolution: string; audio: "off" | "native" | "any"; min: number; max: number; }
const tier = (resolution: string, audio: VideoProviderTariff["audio"], min: number, max = min): VideoProviderTariff => ({resolution,audio,min,max});
export const VIDEO_PROVIDER_TARIFFS: Record<string, readonly VideoProviderTariff[]> = {
  "kling-2.5-turbo": [tier("720p","off",.042),tier("1080p","off",.07)],
  // Console rule 4 (no motion) overlaps subsequent native-audio rules.
  "kling-2.6": [tier("720p","off",.042),tier("1080p","off",.07),tier("1080p","native",.07,.14)],
  // The rule labelled 720p/silent carries an actual 1080 condition and overlaps another rule.
  "kling-3.0": [tier("720p","native",.126),tier("1080p","off",.084,.112),tier("1080p","native",.168),tier("4k","any",.42)],
  "kling-3.0-turbo": [tier("720p","native",.112),tier("1080p","native",.14)],
  "kling-3.0-omni": [tier("720p","off",.084),tier("720p","native",.112),tier("1080p","off",.112),tier("1080p","native",.14),tier("4k","any",.42)],
  "kling-o1": [tier("720p","off",.084),tier("1080p","off",.112)],
  "minimax-h3": [tier("768p","native",.08),tier("2k","native",.13)],
  "minimax-h3-max": [tier("480p","native",.05),tier("768p","native",.08)],
};
/** Unknown audio uses the highest published price at this resolution, never a guessed default. */
export function videoProviderPrice(model: string, resolution?: string, generateAudio?: boolean): { min: number; max: number } | null {
  const tiers = VIDEO_PROVIDER_TARIFFS[model.toLowerCase()];
  if (!tiers) return null;
  const normalized = resolution?.toLowerCase() ?? tiers[0].resolution;
  const matches = tiers.filter(t => t.resolution === normalized && (generateAudio === undefined || t.audio === "any" || t.audio === (generateAudio ? "native" : "off")));
  if (!matches.length) return null;
  return { min: Math.min(...matches.map(t => t.min)), max: Math.max(...matches.map(t => t.max)) };
}
