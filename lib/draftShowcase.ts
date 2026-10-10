/** Public, permanent media only. Never place provider task IDs or signed URLs here. */
export interface DraftShowcaseMedia {
  heroFinal: string;
  heroPoster: string;
  comparisonDraft: string;
  comparisonFinal: string;
  comparisonPoster: string;
  durationSeconds: number;
  /** Describes real native outputs; both comparison clips must use the same edit. */
  draftWidth: number;
  draftHeight: number;
  finalWidth: number;
  finalHeight: number;
}

export const DRAFT_SHOWCASE_MEDIA: DraftShowcaseMedia = {
  heroFinal: "/seedance-draft/film1080.mp4",
  heroPoster: "/seedance-draft/poster.jpg",
  comparisonDraft: "/seedance-draft/draft480.mp4",
  comparisonFinal: "/seedance-draft/film1080.mp4",
  comparisonPoster: "/seedance-draft/poster.jpg",
  durationSeconds: 24,
  draftWidth: 854,
  draftHeight: 480,
  finalWidth: 1920,
  finalHeight: 1080,
};

export const DRAFT_STUDIO_HREF = "/studio?mode=video&model=SIRAYA-Seedance-2.5&draft=1";
