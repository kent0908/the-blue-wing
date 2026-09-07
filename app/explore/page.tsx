import { redirect } from "next/navigation";

// 2026-09-07: this page's content moved back to app/page.tsx (the real
// 首頁 — see that file's comment for why). Kept as a redirect rather than
// deleting outright in case anything still links/bookmarks /explore.
export default function ExploreRedirect() {
  redirect("/");
}
