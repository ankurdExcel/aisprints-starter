import { jwtVerify } from "jose/jwt/verify";

import { encodingSecretKey } from "@/lib/auth/jwt-crypto";
import { isUserRole, type UserRole } from "@/lib/auth/roles";

export type SessionPayload = {
	sub: string;
	email: string;
	role: UserRole;
	iat: number;
	exp: number;
};

/**
 * Verify signature and expiry; returns typed payload or throws.
 */
export async function verifySessionToken(
	token: string,
	secret: string,
): Promise<SessionPayload> {
	const key = encodingSecretKey(secret);
	const { payload } = await jwtVerify(token, key, {
		algorithms: ["HS256"],
	});
	const sub = payload.sub;
	const email = payload.email;
	const role = payload.role;
	const iat = payload.iat;
	const exp = payload.exp;
	if (
		typeof sub !== "string" ||
		typeof email !== "string" ||
		!isUserRole(role) ||
		typeof iat !== "number" ||
		typeof exp !== "number"
	) {
		throw new Error("[jwt] Invalid session token payload.");
	}
	return {
		sub,
		email,
		role,
		iat,
		exp,
	};
}
