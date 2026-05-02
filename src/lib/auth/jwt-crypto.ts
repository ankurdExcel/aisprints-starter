/** HS256 key material from the shared secret string. */
export function encodingSecretKey(secret: string): Uint8Array {
	if (secret.length < 32) {
		throw new Error(
			"[jwt] JWT_SECRET must be at least 32 characters for HS256.",
		);
	}
	return new TextEncoder().encode(secret);
}
