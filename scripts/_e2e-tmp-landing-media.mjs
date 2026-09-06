import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m) continue;
  let val = m[2].trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  if (!(m[1] in process.env)) process.env[m[1]] = val;
}
if (!process.env.POSTGRES_URL) { const f = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL; if (f) process.env.POSTGRES_URL = f; }
if (!process.env.POSTGRES_URL_NON_POOLING && process.env.DATABASE_URL_UNPOOLED) process.env.POSTGRES_URL_NON_POOLING = process.env.DATABASE_URL_UNPOOLED;

const { sql } = await import("@vercel/postgres");
const { upload } = await import("@vercel/blob/client");
const PROD = "https://the-blue-wing.vercel.app";

const email = `e2e-landing-media-${Date.now()}@example.invalid`;
const salt = randomBytes(16);
const dk = scryptSync("test-password-123", salt, 64);
const passwordHash = `scrypt:${salt.toString("hex")}:${dk.toString("hex")}`;
const token = randomBytes(32).toString("base64url");

let userId, nonAdminUserId, nonAdminToken;
try {
  // --- admin test user ---
  const { rows } = await sql`
    insert into users (email, password_hash, role, email_verified, plan_code)
    values (${email}, ${passwordHash}, 'admin', true, 'free')
    returning id
  `;
  userId = rows[0].id;
  console.log("created admin test user", userId);
  const expires = new Date(Date.now() + 3600_000).toISOString();
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${userId}, ${expires})`;

  // --- non-admin test user, to confirm the upload endpoint actually rejects it ---
  const salt2 = randomBytes(16);
  const dk2 = scryptSync("test-password-123", salt2, 64);
  const passwordHash2 = `scrypt:${salt2.toString("hex")}:${dk2.toString("hex")}`;
  nonAdminToken = randomBytes(32).toString("base64url");
  const { rows: rows2 } = await sql`
    insert into users (email, password_hash, role, email_verified, plan_code)
    values (${`e2e-landing-media-nonadmin-${Date.now()}@example.invalid`}, ${passwordHash2}, 'user', true, 'free')
    returning id
  `;
  nonAdminUserId = rows2[0].id;
  await sql`insert into sessions (token, user_id, expires_at) values (${nonAdminToken}, ${nonAdminUserId}, ${expires})`;
  console.log("created non-admin test user", nonAdminUserId);

  console.log("\n=== test 1: non-admin upload attempt should be rejected ===");
  try {
    await upload("e2e-test.png", Buffer.from("fake"), {
      access: "private",
      handleUploadUrl: `${PROD}/api/admin/landing-media/upload`,
      clientPayload: JSON.stringify({ slot: "companions" }),
      headers: { Cookie: `bw_session=${nonAdminToken}` },
    });
    console.log("UNEXPECTED: non-admin upload succeeded");
  } catch (e) {
    console.log("correctly rejected:", e.message);
  }

  console.log("\n=== test 2: admin uploads a real small PNG to the 'companions' slot ===");
  // 1x1 red pixel PNG
  const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const pngBuf = Buffer.from(pngB64, "base64");
  const result = await upload("e2e-test.png", pngBuf, {
    access: "private",
    handleUploadUrl: `${PROD}/api/admin/landing-media/upload`,
    clientPayload: JSON.stringify({ slot: "companions" }),
    headers: { Cookie: `bw_session=${token}` },
  });
  console.log("upload() resolved:", result.pathname);

  // onUploadCompleted is an async webhook from Vercel's blob service - give it
  // a moment, then poll.
  let found = null;
  for (let i = 0; i < 10 && !found; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(`${PROD}/api/landing-media`);
    const json = await res.json();
    if (json.media?.companions) found = json.media.companions;
  }
  console.log("public listing after upload:", found);

  if (found) {
    const mediaRes = await fetch(`${PROD}${found.url}`);
    console.log("fetching the actual file:", mediaRes.status, mediaRes.headers.get("content-type"), mediaRes.headers.get("content-length"));
  }

  console.log("\n=== test 3: landing page itself now shows this override instead of the CSS fallback ===");
  const pageHtml = await (await fetch(PROD)).text();
  console.log("page includes /api/landing-media/companions:", pageHtml.includes("/api/landing-media/companions"));

  console.log("\n=== test 4: admin deletes it, falls back to default visual again ===");
  const delRes = await fetch(`${PROD}/api/admin/landing-media?slot=companions`, { method: "DELETE", headers: { Cookie: `bw_session=${token}` } });
  console.log("delete status:", delRes.status, await delRes.json().catch(() => ({})));
  const afterDelete = await (await fetch(`${PROD}/api/landing-media`)).json();
  console.log("companions slot after delete:", afterDelete.media?.companions ?? "(none, as expected)");
} finally {
  for (const uid of [userId, nonAdminUserId]) {
    if (!uid) continue;
    try {
      await sql`delete from sessions where user_id = ${uid}`;
      await sql`delete from credit_ledger where user_id = ${uid}`;
      await sql`delete from generations where user_id = ${uid}`;
      await sql`delete from users where id = ${uid}`;
    } catch (e) {
      console.log("cleanup error for user", uid, e.message);
    }
  }
  console.log("cleaned up test users");
}
