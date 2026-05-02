import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { formatZodError, loginBodySchema } from "@/lib/auth/auth-schemas";
import { createSessionToken } from "@/lib/auth/jwt";
import { getJwtSecret } from "@/lib/auth/get-jwt-secret";
import { buildSetSessionCookieHeader } from "@/lib/auth/session-cookie";
import { SESSION_TOKEN_EXPIRES } from "@/lib/auth/session-constants";
import { verifyPassword } from "@/lib/auth/password";
import { getDatabase } from "@/lib/d1-client";
import { findUserByEmail, userRowToPublicUser } from "@/lib/services/user-service";

export const dynamic = "force-dynamic";

const INVALID_LOGIN_MESSAGE = "Invalid email or password";

export async function POST(request: Request) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = loginBodySchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(formatZodError(parsed.error), { status: 400 });
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
		const db = getDatabase(env as Cloudflare.Env);
		const row = await findUserByEmail(db, parsed.data.email);

		if (!row) {
			return NextResponse.json(
				{ message: INVALID_LOGIN_MESSAGE },
				{ status: 401 },
			);
		}

		const valid = await verifyPassword(parsed.data.password, row.password_hash);
		if (!valid) {
			return NextResponse.json(
				{ message: INVALID_LOGIN_MESSAGE },
				{ status: 401 },
			);
		}

		const user = userRowToPublicUser(row);
		const token = await createSessionToken(
			{ sub: user.id, email: user.email, role: user.role },
			secret,
			SESSION_TOKEN_EXPIRES,
		);

		const res = NextResponse.json({ user }, { status: 200 });
		res.headers.append("Set-Cookie", buildSetSessionCookieHeader(token));
		return res;
	} catch (e) {
		console.error("login error", e);
		return NextResponse.json({ message: "Internal server error" }, {
			status: 500,
		});
	}
}
