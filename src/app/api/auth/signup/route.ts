import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { formatZodError, signupBodySchema } from "@/lib/auth/auth-schemas";
import { createSessionToken } from "@/lib/auth/jwt";
import { getJwtSecret } from "@/lib/auth/get-jwt-secret";
import {
	buildSetSessionCookieHeader,
} from "@/lib/auth/session-cookie";
import { SESSION_TOKEN_EXPIRES } from "@/lib/auth/session-constants";
import { getDatabase } from "@/lib/d1-client";
import { createUser } from "@/lib/services/user-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = signupBodySchema.safeParse(body);
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
		const result = await createUser(db, parsed.data);

		if (!result.success) {
			if (result.error === "EMAIL_TAKEN") {
				return NextResponse.json(
					{ message: "Email already registered" },
					{ status: 409 },
				);
			}
			if (
				result.error === "INVALID_INPUT" ||
				result.error === "INVALID_ROLE"
			) {
				return NextResponse.json(
					{ message: "Invalid input", code: result.error },
					{ status: 400 },
				);
			}
			return NextResponse.json({ message: "Could not create account" }, {
				status: 500,
			});
		}

		const token = await createSessionToken(
			{
				sub: result.user.id,
				email: result.user.email,
				role: result.user.role,
			},
			secret,
			SESSION_TOKEN_EXPIRES,
		);

		const res = NextResponse.json({ user: result.user }, { status: 201 });
		res.headers.append("Set-Cookie", buildSetSessionCookieHeader(token));
		return res;
	} catch (e) {
		console.error("signup error", e);
		return NextResponse.json({ message: "Internal server error" }, {
			status: 500,
		});
	}
}
