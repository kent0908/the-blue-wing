import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { BusinessError } from "./businessTypes";

interface SecretEnvelope {
  v: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

/** A dedicated key is mandatory: never derive it from a platform generation key or auth secret. */
function encryptionKey(): Buffer {
  const encoded = process.env.BYOK_ENCRYPTION_KEY ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new BusinessError("encryption_unavailable", 503);
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    key.fill(0);
    throw new BusinessError("encryption_unavailable", 503);
  }
  return key;
}

export function isBusinessEncryptionReady(): boolean {
  try {
    const key = encryptionKey();
    key.fill(0);
    return true;
  } catch {
    return false;
  }
}

function aad(userId: number, accountId: string, credentialId: string): Buffer {
  return Buffer.from(`tbw:business:siraya:v1:${userId}:${accountId}:${credentialId}`, "utf8");
}

export function encryptBusinessSecret(apiKey: string, userId: number, accountId: string, credentialId: string): SecretEnvelope {
  const key = encryptionKey();
  const plaintext = Buffer.from(apiKey, "utf8");
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aad(userId, accountId, credentialId));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
  } finally {
    key.fill(0);
    plaintext.fill(0);
  }
}

export function decryptBusinessSecret(value: unknown, userId: number, accountId: string, credentialId: string): string {
  const key = encryptionKey();
  let plaintext: Buffer | undefined;
  try {
    if (!value || typeof value !== "object") throw new Error("invalid envelope");
    const envelope = value as Partial<SecretEnvelope>;
    if (envelope.v !== 1 || typeof envelope.iv !== "string" || typeof envelope.tag !== "string" || typeof envelope.ciphertext !== "string") throw new Error("invalid envelope");
    if (envelope.iv.length !== 16 || envelope.tag.length !== 24 || envelope.ciphertext.length > 512) throw new Error("invalid envelope");
    const iv = Buffer.from(envelope.iv, "base64");
    const tag = Buffer.from(envelope.tag, "base64");
    if (iv.length !== 12 || tag.length !== 16) throw new Error("invalid envelope");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad(userId, accountId, credentialId));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
    const secret = plaintext.toString("utf8");
    if (!/^sk-[A-Za-z0-9_-]{16,200}$/.test(secret)) throw new Error("invalid plaintext");
    return secret;
  } catch {
    // Authentication failures never echo the envelope, ciphertext or decryption errors.
    throw new BusinessError("credential_unavailable", 503);
  } finally {
    key.fill(0);
    plaintext?.fill(0);
  }
}
