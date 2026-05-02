import bcrypt from "bcryptjs";

const DEFAULT_SALT_ROUNDS = 10;

/**
 * One-way password hash for storage (bcrypt, pure JS — Worker-safe).
 */
export async function hashPassword(
	plain: string,
	saltRounds: number = DEFAULT_SALT_ROUNDS,
): Promise<string> {
	return new Promise((resolve, reject) => {
		bcrypt.hash(plain, saltRounds, (err, hash) => {
			if (err) reject(err);
			else resolve(hash);
		});
	});
}

/**
 * Constant-time comparison against a stored bcrypt hash.
 */
export async function verifyPassword(
	plain: string,
	hash: string,
): Promise<boolean> {
	return new Promise((resolve, reject) => {
		bcrypt.compare(plain, hash, (err, same) => {
			if (err) reject(err);
			else resolve(Boolean(same));
		});
	});
}
