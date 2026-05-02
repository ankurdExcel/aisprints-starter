import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { getJwtSecret } from "@/lib/auth/get-jwt-secret";
import {
	parseCookieValue,
} from "@/lib/auth/session-cookie";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-constants";
import { verifySessionToken } from "@/lib/auth/jwt";
import { getDatabase } from "@/lib/d1-client";
import { findUserById } from "@/lib/services/user-service";

export const dynamic = "force-dynamic";

const UNAUTH = { message: "Unauthorized" };

export async function GET(request: Request) {
	const token = parseCookieValue(
		request.headers.get("cookie"),
		SESSION_COOKIE_NAME,
	);
	if (!token) {
		return NextResponse.json(UNAUTH, { status: 401 });
	}

	let secret: string;
	try {
		const { env } = await getCloudflareContext({ async: true });
		try {
			secret = getJwtSecret(env as Cloudflare.Env);
		} catch {
			return NextResponse.json(
				{ message: "Server configuration error" },
				{ status: 500 },
			);
		}
		const payload = await verifySessionToken(token, secret);
		const db = getDatabase(env as Cloudflare.Env);
		const user = await findUserById(db, payload.sub);
		if (!user) {
			return NextResponse.json(UNAUTH, { status: 401 });
		}
		return NextResponse.json({ user }, { status: 200 });
	} catch {
		return NextResponse.json(UNAUTH, { status: 401 });
	}
}
