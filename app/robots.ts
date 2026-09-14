import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

/**
 * Public pages are open to every crawler, including the AI assistants'
 * (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) — being citable by
 * them is a goal, not a leak. Everything behind the login wall, the auth
 * forms and the back office are disallowed for all.
 */
const PRIVATE = ["/api/", "/studio", "/account", "/assets", "/avatar", "/canvas", "/editor", "/layers", "/explore", "/crm", "/admin", "/login", "/register", "/forgot-password", "/reset-password", "/verify", "/companions/create", "/companions/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: ["GPTBot", "ClaudeBot", "Claude-Web", "PerplexityBot", "Google-Extended", "CCBot", "anthropic-ai", "OAI-SearchBot"], allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
