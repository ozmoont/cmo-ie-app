/**
 * Newsletter subscription helpers — confirmation tokens are HMAC-signed
 * strings of `{email}:{purpose}:{issued_at}`. We store only the hash
 * in the DB to keep the secret out of the row even under backup.
 *
 * Confirmation flow:
 *   1. POST /api/newsletter/subscribe { email, source } →
 *      mint token, insert row with confirm_token_hash, send email.
 *   2. User clicks /newsletter/confirm?token=... →
 *      verify HMAC, look up row, set subscribed_at + clear token_hash.
 *   3. Unsubscribe → set unsubscribed_at, never actually delete.
 *
 * We deliberately don't ship email sending in this module — the admin
 * dispatcher wires Resend/Postmark when that lands. For now, the
 * /api/newsletter/subscribe route returns the confirmation URL so
 * we can copy-paste it during local testing.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PURPOSE = "newsletter-confirm";

function secret(): string {
  const k = process.env.NEWSLETTER_TOKEN_SECRET;
  if (!k || k.length < 16) {
    throw new Error(
      "NEWSLETTER_TOKEN_SECRET must be set to a 16+ char secret"
    );
  }
  return k;
}

/**
 * Generate a confirmation token. The plaintext goes in the email; the
 * caller hashes it with `hashToken()` before DB storage.
 */
export function mintConfirmToken(email: string): {
  plaintext: string;
  hash: string;
} {
  const issuedAt = Date.now();
  const nonce = randomBytes(8).toString("hex");
  const payload = `${email.toLowerCase()}:${PURPOSE}:${issuedAt}:${nonce}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  const plaintext = `${Buffer.from(payload).toString("base64url")}.${sig}`;
  return { plaintext, hash: hashToken(plaintext) };
}

/** SHA-256 of the token plaintext. Returns hex. */
export function hashToken(plaintext: string): string {
  return createHmac("sha256", secret()).update(plaintext).digest("hex");
}

/**
 * Verify a confirmation token. Returns the email if valid (+ not
 * expired beyond maxAgeMs), null otherwise.
 */
export function verifyConfirmToken(
  plaintext: string,
  maxAgeMs = 30 * 24 * 60 * 60 * 1000 // 30 days
): { email: string } | null {
  const [encoded, sig] = plaintext.split(".");
  if (!encoded || !sig) return null;
  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf-8");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret()).update(payload).digest("hex");
  // Constant-time comparison.
  let ok = false;
  try {
    ok = timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    ok = false;
  }
  if (!ok) return null;

  const [email, purpose, issuedAtStr] = payload.split(":");
  if (!email || purpose !== PURPOSE) return null;
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > maxAgeMs) return null;
  return { email };
}
