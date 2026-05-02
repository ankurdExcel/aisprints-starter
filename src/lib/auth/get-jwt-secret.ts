/**
 * Read JWT signing secret from the runtime environment (Wrangler / OpenNext injects `.dev.vars`).
 * @throws If missing or shorter than 32 characters (HS256 policy in `jwt.ts`).
 */
export function getJwtSecret(): string {
	const secret = process.env.JWT_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error("JWT_SECRET must be set and at least 32 characters.");
	}
	return secret;
}
