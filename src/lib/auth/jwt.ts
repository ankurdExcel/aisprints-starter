import * as jose from "jose";

import { isUserRole, type UserRole } from "@/lib/auth/roles";

export type SessionPayload = {
	sub: string;
	email: string;
	role: UserRole;
	iat: number;
	exp: number;
};

const DEFAULT_EXPIRES = "7d";

function getSecretKey(secret: string): Uint8Array {
	if (secret.length < 32) {
		throw new Error(
			"[jwt] JWT_SECRET must be at least 32 characters for HS256.",
		);
	}
	return new TextEncoder().encode(secret);
}

/**
 * Sign a session JWT (HS256). Caller supplies secret (e.g. from env).
 */
export async function createSessionToken(
	claims: { sub: string; email: string; role: UserRole },
	secret: string,
	expiresIn: string = DEFAULT_EXPIRES,
): Promise<string> {
	const key = getSecretKey(secret);
	return new jose.SignJWT({
		email: claims.email,
		role: claims.role,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(claims.sub)
		.setIssuedAt()
		.setExpirationTime(expiresIn)
		.sign(key);
}

/**
 * Verify signature and expiry; returns typed payload or throws.
 */
export async function verifySessionToken(
	token: string,
	secret: string,
): Promise<SessionPayload> {
	const key = getSecretKey(secret);
	const { payload } = await jose.jwtVerify(token, key, {
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
