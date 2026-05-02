import { dashboardPathForRole } from "@/lib/auth/dashboard-path";
import type { UserRole } from "@/lib/auth/roles";

/**
 * If `pathname` is under `/faculty` or `/student`, returns the role required to access it.
 * Root `/` and other paths return `null` (not role-guarded by this helper).
 */
export function requiredRoleForPathname(pathname: string): UserRole | null {
	if (pathname === "/faculty" || pathname.startsWith("/faculty/")) {
		return "faculty";
	}
	if (pathname === "/student" || pathname.startsWith("/student/")) {
		return "student";
	}
	return null;
}

/**
 * Returns a same-origin path + query safe to use after login, or `null` if untrusted.
 * Rejects open redirects, non-path URLs, API routes, and auth pages.
 */
export function sanitizeReturnUrl(raw: string | null | undefined): string | null {
	if (raw == null) return null;
	let decoded = raw.trim();
	if (!decoded) return null;
	try {
		decoded = decodeURIComponent(decoded);
	} catch {
		return null;
	}
	if (decoded.length > 512) return null;
	if (decoded.includes("\0") || decoded.includes("..") || decoded.includes("\\")) {
		return null;
	}
	if (decoded.includes("://") || decoded.startsWith("//")) return null;
	if (!decoded.startsWith("/")) return null;

	const pathOnly = decoded.split("?")[0] ?? "";
	if (pathOnly.startsWith("//")) return null;

	if (
		pathOnly === "/login" ||
		pathOnly === "/signup" ||
		pathOnly.startsWith("/login/") ||
		pathOnly.startsWith("/signup/")
	) {
		return null;
	}
	if (pathOnly.startsWith("/api/")) return null;

	return decoded;
}

/**
 * After authentication, choose redirect: safe `returnUrl` if it matches the user's role,
 * otherwise the role dashboard.
 */
export function resolvePostAuthRedirect(
	role: UserRole,
	returnUrlRaw: string | null | undefined,
): string {
	const safe = sanitizeReturnUrl(returnUrlRaw);
	if (!safe) {
		return dashboardPathForRole(role);
	}

	let pathname: string;
	try {
		pathname = new URL(safe, "https://example.invalid").pathname;
	} catch {
		return dashboardPathForRole(role);
	}

	const needed = requiredRoleForPathname(pathname);
	if (needed === null) {
		return dashboardPathForRole(role);
	}
	if (needed !== role) {
		return dashboardPathForRole(role);
	}
	return safe;
}
