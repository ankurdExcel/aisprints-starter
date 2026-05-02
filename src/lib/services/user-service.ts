import { hashPassword } from "@/lib/auth/password";
import { isUserRole, type UserRole } from "@/lib/auth/roles";
import {
	executeMutation,
	executeQueryFirst,
	generateId,
} from "@/lib/d1-client";

export type { UserRole } from "@/lib/auth/roles";

/** Row as returned from D1 (snake_case). */
export type UserRow = {
	id: string;
	email: string;
	password_hash: string;
	first_name: string;
	last_name: string;
	role: UserRole;
	created_at: string;
	updated_at: string;
	created_by: string | null;
	updated_by: string | null;
};

export type PublicUser = {
	id: string;
	email: string;
	firstName: string;
	lastName: string;
	role: UserRole;
	createdAt: string;
	updatedAt: string;
};

export type CreateUserInput = {
	firstName: string;
	lastName: string;
	email: string;
	password: string;
	role: UserRole;
};

export type CreateUserResult =
	| { success: true; user: PublicUser }
	| { success: false; error: "EMAIL_TAKEN" }
	| { success: false; error: "INVALID_ROLE" }
	| { success: false; error: "INVALID_INPUT" };

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function isUniqueConstraintError(error: unknown): boolean {
	const msg = error instanceof Error ? error.message : String(error);
	return (
		msg.includes("UNIQUE constraint failed") ||
		msg.includes("SQLITE_CONSTRAINT") ||
		(msg.includes("unique") && msg.includes("constraint"))
	);
}

/**
 * Insert a new user. Email is stored normalized (trim + lowercase).
 */
export async function createUser(
	db: D1Database,
	input: CreateUserInput,
): Promise<CreateUserResult> {
	if (!isUserRole(input.role)) {
		return { success: false, error: "INVALID_ROLE" };
	}

	const email = normalizeEmail(input.email);
	const firstName = input.firstName.trim();
	const lastName = input.lastName.trim();
	if (!firstName || !lastName) {
		return { success: false, error: "INVALID_INPUT" };
	}

	const id = generateId();
	const now = new Date().toISOString();
	const password_hash = await hashPassword(input.password);

	const sql = `
    INSERT INTO users (
      id, email, password_hash, first_name, last_name, role,
      created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

	try {
		await executeMutation(db, sql, [
			id,
			email,
			password_hash,
			firstName,
			lastName,
			input.role,
			now,
			now,
			null,
			null,
		]);
	} catch (e) {
		if (isUniqueConstraintError(e)) {
			return { success: false, error: "EMAIL_TAKEN" };
		}
		throw e;
	}

	const user: PublicUser = {
		id,
		email,
		firstName,
		lastName,
		role: input.role,
		createdAt: now,
		updatedAt: now,
	};

	return { success: true, user };
}

/**
 * Load user by email for authentication (includes password hash).
 */
export async function findUserByEmail(
	db: D1Database,
	email: string,
): Promise<UserRow | null> {
	const normalized = normalizeEmail(email);
	const sql = `
    SELECT id, email, password_hash, first_name, last_name, role,
           created_at, updated_at, created_by, updated_by
    FROM users
    WHERE email = ?
  `;
	const row = await executeQueryFirst<UserRow>(db, sql, [normalized]);
	if (!row) return null;
	if (!isUserRole(row.role)) return null;
	return row;
}

type UserPublicRow = {
	id: string;
	email: string;
	first_name: string;
	last_name: string;
	role: string;
	created_at: string;
	updated_at: string;
	created_by: string | null;
	updated_by: string | null;
};

/**
 * Load user without password hash (e.g. session refresh).
 */
export async function findUserById(
	db: D1Database,
	id: string,
): Promise<PublicUser | null> {
	const sql = `
    SELECT id, email, first_name, last_name, role,
           created_at, updated_at, created_by, updated_by
    FROM users
    WHERE id = ?
  `;
	const row = await executeQueryFirst<UserPublicRow>(db, sql, [id]);
	if (!row) return null;
	if (!isUserRole(row.role)) return null;
	return {
		id: row.id,
		email: row.email,
		firstName: row.first_name,
		lastName: row.last_name,
		role: row.role,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}
