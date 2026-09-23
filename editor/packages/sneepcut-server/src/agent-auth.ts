import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isUUID } from "./store";

// The grant is bound to the exact body and expires quickly. It is never sent to
// the browser, and is accepted only on the single typed agent endpoint.
export function verifyAgentGrant(
  raw: string,
  header: string | undefined,
  secret: string | undefined,
  now = Date.now(),
): string | null {
  if (!secret || secret.length < 32 || !header) return null;
  const [user, expiry, signature, extra] = header.split(":");
  if (
    extra !== undefined ||
    !user ||
    !isUUID(user) ||
    !expiry ||
    !/^\d{10}$/.test(expiry) ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return null;
  const seconds = Math.floor(now / 1000);
  if (Number(expiry) < seconds || Number(expiry) > seconds + 60) return null;
  const digest = createHash("sha256").update(raw).digest("hex");
  const expected = createHmac("sha256", secret).update(`${user}\n${expiry}\n${digest}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex")) ? user : null;
}
