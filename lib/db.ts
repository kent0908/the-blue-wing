/**
 * Postgres access via @vercel/postgres.
 *
 * Reads POSTGRES_URL (and friends) from the environment — these are injected
 * automatically when you attach a Vercel Postgres / Neon store to the project.
 * For local dev run `vercel env pull .env.local` first.
 *
 * Every query goes through the `sql` tagged template (parameterised, no string
 * interpolation) so there is no SQL-injection surface.
 */
import { sql } from "@vercel/postgres";

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
