import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { getJwtSecret } from "@/lib/auth/get-jwt-secret";
import { parseCookieValue } from "@/lib/auth/session-cookie";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-constants";
import { verifySessionToken } from "@/lib/auth/jwt";
import { getDatabase } from "@/lib/d1-client";
import { findUserById } from "@/lib/services/user-service";

export type FacultyRequestResult =
	| { ok: true; db: D1Database; facultyUserId: string }
	| { ok: false; response: NextResponse };

/**
 * Requires a valid session cookie and a user with role `faculty`.
 * Used by `/api/faculty/**` route handlers.
 */
export async function requireFacultyRequest(
	request: Request,
): Promise<FacultyRequestResult> {
	const token = parseCookieValue(
		request.headers.get("cookie"),
		SESSION_COOKIE_NAME,
	);
	if (!token) {
		return {
			ok: false,
			response: NextResponse.json({ message: "Unauthorized" }, {
				status: 401,
			}),
		};
	}

	try {
		const { env } = await getCloudflareContext({ async: true });
		let secret: string;
		try {
			secret = getJwtSecret(env as Cloudflare.Env);
		} catch {
			return {
				ok: false,
				response: NextResponse.json(
					{ message: "Server configuration error" },
					{ status: 500 },
				),
			};
		}

		const payload = await verifySessionToken(token, secret);
		const db = getDatabase(env as Cloudflare.Env);
		const user = await findUserById(db, payload.sub);
		if (!user) {
			return {
				ok: false,
				response: NextResponse.json({ message: "Unauthorized" }, {
					status: 401,
				}),
			};
		}
		if (user.role !== "faculty") {
			return {
				ok: false,
				response: NextResponse.json({ message: "Forbidden" }, {
					status: 403,
				}),
			};
		}

		return { ok: true, db, facultyUserId: user.id };
	} catch {
		return {
			ok: false,
			response: NextResponse.json({ message: "Unauthorized" }, {
				status: 401,
			}),
		};
	}
}
