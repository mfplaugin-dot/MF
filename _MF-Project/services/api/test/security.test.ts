import test from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret, hashPassword, hashToken, randomToken, signSession, verifyScryptPassword, verifySession } from "../src/security.js";
import { plans } from "../src/store.js";

test("customer access tokens are unguessable and stored as hashes", () => {
  const token = randomToken();
  assert.ok(token.length >= 40);
  assert.notEqual(hashToken(token), token);
  assert.notEqual(hashToken(token), hashToken(randomToken()));
});

test("scrypt password verification accepts only the correct password", () => {
  const hashed = hashPassword("high-entropy test password", "deadbeef");
  assert.ok(verifyScryptPassword("high-entropy test password", hashed));
  assert.ok(!verifyScryptPassword("wrong", hashed));
  assert.ok(!verifyScryptPassword("password", "plain$password"));
});

test("admin sessions are signed, role-scoped, and expire", () => {
  const secret = "x".repeat(40);
  const session = signSession("operator", secret, 1_000_000);
  assert.ok(verifySession(session, secret, 1_001_000));
  assert.ok(!verifySession(session, "wrong-secret", 1_001_000));
  assert.ok(!verifySession(session, secret, 30_000_000));
  assert.ok(!verifySession(session + ".tampered", secret, 1_001_000));
});

test("fulfillment encryption is authenticated and rejects tampering", () => {
  const key = "a".repeat(64);
  const encrypted = encryptSecret(JSON.stringify({ username: "x@.emf", password: "secret" }), key);
  assert.deepEqual(JSON.parse(decryptSecret(encrypted, key)), { username: "x@.emf", password: "secret" });
  assert.throws(() => decryptSecret(encrypted, "b".repeat(64)));
  assert.throws(() => encryptSecret("x", "invalid"));
});

test("catalog plan values and device limits are fixed to the approved offer", () => {
  assert.deepEqual(plans.monthly, { price: 200, deviceLimit: 1, durationDays: 30 });
  assert.deepEqual(plans.lifetime, { price: 1500, deviceLimit: 3, durationDays: null });
});
