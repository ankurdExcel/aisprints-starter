/**
 * Read JWT signing secret for HS256 (`jwt-crypto.ts` requires length ≥ 32).
 *
 * During `next dev`, OpenNext loads `.dev.vars` into the Cloudflare `env` object from
 * `getCloudflareContext`, not into `process.env`. Prefer `process.env` when set (e.g. `.env.local`),
 * then fall back to `env.JWT_SECRET` from Wrangler / Workers.
 */
export function getJwtSecret(env?: Cloudflare.Env): string {
	const fromProcess = process.env.JWT_SECRET;
	if (fromProcess && fromProcess.length >= 32) {
		return fromProcess;
	}

	const fromBindings = (env as { JWT_SECRET?: string } | undefined)?.JWT_SECRET;
	if (fromBindings && fromBindings.length >= 32) {
		return fromBindings;
	}

	throw new Error("JWT_SECRET must be set and at least 32 characters.");
}
