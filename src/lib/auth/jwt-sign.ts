import { SignJWT } from "jose/jwt/sign";

import { encodingSecretKey } from "@/lib/auth/jwt-crypto";
import type { UserRole } from "@/lib/auth/roles";

const DEFAULT_EXPIRES = "7d";

/**
 * Sign a session JWT (HS256). Caller supplies secret (e.g. from env).
 */
export async function createSessionToken(
	claims: { sub: string; email: string; role: UserRole },
	secret: string,
	expiresIn: string = DEFAULT_EXPIRES,
): Promise<string> {
	const key = encodingSecretKey(secret);
	return new SignJWT({
		email: claims.email,
		role: claims.role,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(claims.sub)
		.setIssuedAt()
		.setExpirationTime(expiresIn)
		.sign(key);
}
