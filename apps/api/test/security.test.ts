import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  tokenHash,
  allowedTransition,
} from "../src/security.js";
test("passwords use distinct salted hashes and reject wrong passwords", () => {
  const password = "A long test password";
  const first = hashPassword(password);
  assert.notEqual(first, hashPassword(password));
  assert.equal(verifyPassword(password, first), true);
  assert.equal(verifyPassword("wrong", first), false);
  assert.equal(verifyPassword(password, "invalid"), false);
});
test("session token hashes are deterministic and do not expose the token", () => {
  const token = "abc";
  assert.equal(tokenHash(token), tokenHash(token));
  assert.notEqual(tokenHash(token), token);
});
test("operators submit for review but cannot approve; reviewers cannot submit", () => {
  assert.equal(allowedTransition("operator", "draft", "review"), true);
  assert.equal(allowedTransition("operator", "review", "approved"), false);
  assert.equal(allowedTransition("reviewer", "review", "approved"), true);
  assert.equal(allowedTransition("reviewer", "draft", "review"), false);
  assert.equal(allowedTransition("viewer", "draft", "review"), false);
  assert.equal(allowedTransition("admin", "approved", "draft"), false);
});
