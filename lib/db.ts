/**
 * Postgres access via @vercel/postgres.
 *
 * The Neon-on-Vercel integration injects DATABASE_URL / DATABASE_URL_UNPOOLED;
 * older Vercel Postgres injects POSTGRES_URL. @vercel/postgres only looks for
 * POSTGRES_URL, so we alias it here from whatever is present before the first
 * query runs (the driver resolves the connection string lazily).
 *
 * Every query goes through the `sql` tagged template (parameterised, no string
 * interpolation) so there is no SQL-injection surface.
 */
import { sql } from "@vercel/postgres";

// Alias Neon's DATABASE_URL onto the names @vercel/postgres expects. Runs at
// module init, before the driver resolves its connection string on first query.
if (!process.env.POSTGRES_URL) {
  const fallback = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
  if (fallback) process.env.POSTGRES_URL = fallback;
}
if (!process.env.POSTGRES_URL_NON_POOLING && process.env.DATABASE_URL_UNPOOLED) {
  process.env.POSTGRES_URL_NON_POOLING = process.env.DATABASE_URL_UNPOOLED;
}

export { sql };

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  role: "user" | "admin";
  status: "active" | "banned";
  email_verified: boolean;
  verify_token: string | null;
  verify_expires: string | null;
  plan_code: string;
  plan_renews_at: string | null;
  created_at: string;
}

/** Public shape sent to the client — never includes password_hash / tokens. */
export interface PublicUser {
  id: number;
  email: string;
  role: "user" | "admin";
  status: "active" | "banned";
  emailVerified: boolean;
  planCode: string;
  planRenewsAt: string | null;
  createdAt: string;
}

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    emailVerified: u.email_verified,
    planCode: u.plan_code,
    planRenewsAt: u.plan_renews_at,
    createdAt: u.created_at,
  };
}

// Schema lives in scripts/schema.sql — run `npm run db:migrate` to apply it.
