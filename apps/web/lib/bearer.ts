import { timingSafeEqual } from "node:crypto";

/** Constant-time `Authorization: Bearer <secret>` check (webhooks). */
export function bearerMatches(header: string | null, secret: string): boolean {
  const provided = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
