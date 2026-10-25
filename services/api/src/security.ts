import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function verifyScryptPassword(password: string, encoded: string): boolean {
  const [scheme, salt, expectedHex] = encoded.split("$");
  if (scheme !== "scrypt" || !salt || !/^[a-f0-9]{128}$/i.test(expectedHex ?? "")) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function signSession(subject: string, secret: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ sub: subject, role: "admin", exp: Math.floor(now / 1000) + 8 * 60 * 60 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySession(token: string, secret: string, now = Date.now()): boolean {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, "base64url"); } catch { return false; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.role === "admin" && typeof payload.sub === "string" && payload.exp > Math.floor(now / 1000);
  } catch { return false; }
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")): string {
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

export function encryptSecret(value: string, keyHex: string): string {
  if (!/^[a-f0-9]{64}$/i.test(keyHex)) throw new Error("CREDENTIAL_ENCRYPTION_KEY must be 32-byte hex");
  const { createCipheriv } = require("node:crypto") as typeof import("node:crypto");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value: string, keyHex: string): string {
  const { createDecipheriv } = require("node:crypto") as typeof import("node:crypto");
  const [iv, tag, data] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !data || !/^[a-f0-9]{64}$/i.test(keyHex)) throw new Error("Invalid encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
