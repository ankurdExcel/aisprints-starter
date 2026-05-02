import {
	SESSION_COOKIE_NAME,
	SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session-constants";

function isProduction(): boolean {
	return process.env.NODE_ENV === "production";
}

/**
 * `Set-Cookie` value for a new session (HttpOnly, SameSite=Lax, Secure in production).
 */
export function buildSetSessionCookieHeader(
	token: string,
	maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
): string {
	const value = encodeURIComponent(token);
	const secure = isProduction() ? "; Secure" : "";
	return `${SESSION_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

/**
 * `Set-Cookie` that clears the session cookie in the browser.
 */
export function buildClearSessionCookieHeader(): string {
	const secure = isProduction() ? "; Secure" : "";
	return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}

/**
 * Read a cookie value from the raw `Cookie` header (first match).
 */
export function parseCookieValue(
	cookieHeader: string | null,
	name: string,
): string | null {
	if (!cookieHeader) return null;
	const segments = cookieHeader.split(";").map((s) => s.trim());
	const prefix = `${name}=`;
	for (const seg of segments) {
		if (seg.startsWith(prefix)) {
			try {
				return decodeURIComponent(seg.slice(prefix.length));
			} catch {
				return seg.slice(prefix.length);
			}
		}
	}
	return null;
}
