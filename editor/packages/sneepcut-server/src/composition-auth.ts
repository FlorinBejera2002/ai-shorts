import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isUUID } from "./store";

/** Composition grants cannot authorize browser APIs or the agent bridge. */
export function verifyCompositionGrant(
  body: string,
  header: string | null,
  secret: string | undefined,
  now = Date.now(),
): string | null {
  if (!secret || secret.length < 32 || !header) return null;
  const [owner, expiry, signature, extra] = header.split(":");
  if (
    extra !== undefined ||
    !owner ||
    !isUUID(owner) ||
    !expiry ||
    !/^\d{10}$/.test(expiry) ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return null;
  const seconds = Math.floor(now / 1000);
  if (Number(expiry) < seconds || Number(expiry) > seconds + 60) return null;
  const digest = createHash("sha256").update(body).digest("hex");
  const expected = createHmac("sha256", secret)
    .update(`composition\n${owner}\n${expiry}\n${digest}`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex")) ? owner : null;
}
