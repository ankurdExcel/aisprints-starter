import { getCloudflareContext } from "@opennextjs/cloudflare";
import { type NextRequest, NextResponse } from "next/server";

import { dashboardPathForRole } from "@/lib/auth/dashboard-path";
import { getJwtSecret } from "@/lib/auth/get-jwt-secret";
import { verifySessionToken } from "@/lib/auth/jwt-verify";
import { requiredRoleForPathname } from "@/lib/auth/route-guard";
import { parseCookieValue } from "@/lib/auth/session-cookie";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-constants";

export async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const requiredRole = requiredRoleForPathname(pathname);
	if (requiredRole === null) {
		return NextResponse.next();
	}

	let secret: string;
	try {
		const { env } = await getCloudflareContext({ async: true });
		secret = getJwtSecret(env as Cloudflare.Env);
	} catch {
		return new NextResponse("Server configuration error", { status: 500 });
	}

	const token = parseCookieValue(
		request.headers.get("cookie"),
		SESSION_COOKIE_NAME,
	);
	if (!token) {
		const login = new URL("/login", request.url);
		login.searchParams.set(
			"returnUrl",
			`${pathname}${request.nextUrl.search}`,
		);
		return NextResponse.redirect(login);
	}

	try {
		const payload = await verifySessionToken(token, secret);
		if (payload.role !== requiredRole) {
			return NextResponse.redirect(
				new URL(dashboardPathForRole(payload.role), request.url),
			);
		}
		return NextResponse.next();
	} catch {
		const login = new URL("/login", request.url);
		login.searchParams.set(
			"returnUrl",
			`${pathname}${request.nextUrl.search}`,
		);
		return NextResponse.redirect(login);
	}
}

export const config = {
	matcher: ["/faculty/:path*", "/student/:path*"],
};
