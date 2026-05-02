/**
 * Session JWT helpers. Prefer importing `verifySessionToken` from
 * `@/lib/auth/jwt-verify` in Edge middleware to avoid pulling signing code.
 */
export type { SessionPayload } from "@/lib/auth/jwt-verify";
export { createSessionToken } from "@/lib/auth/jwt-sign";
export { verifySessionToken } from "@/lib/auth/jwt-verify";
