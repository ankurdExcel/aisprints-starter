import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/d1-client", () => ({
	executeMutation: vi.fn(),
	executeQueryFirst: vi.fn(),
	generateId: vi.fn(() => "generated-id-hex-32chars-123456"),
}));

import {
	executeMutation,
	executeQueryFirst,
	generateId,
} from "@/lib/d1-client";
import {
	type CreateUserInput,
	createUser,
	findUserByEmail,
	findUserById,
} from "./user-service";

const mockDb = {} as D1Database;

beforeEach(() => {
	vi.clearAllMocks();
});

describe("createUser", () => {
	it("inserts with normalized lowercase email and hashed password", async () => {
		vi.mocked(executeMutation).mockResolvedValueOnce({
			success: true,
			meta: {},
			results: [],
		});

		const result = await createUser(mockDb, {
			firstName: " Ada ",
			lastName: " Lovelace ",
			email: " Ada@Example.COM ",
			password: "hunter2hunter2",
			role: "faculty",
		});

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.user.email).toBe("ada@example.com");
		expect(result.user.firstName).toBe("Ada");
		expect(result.user.lastName).toBe("Lovelace");
		expect(result.user.role).toBe("faculty");
		expect(result.user.id).toBe("generated-id-hex-32chars-123456");
		expect(generateId).toHaveBeenCalled();

		expect(executeMutation).toHaveBeenCalledTimes(1);
		const [, sql, params] = vi.mocked(executeMutation).mock.calls[0]!;
		expect(sql).toContain("INSERT INTO users");
		expect(params![1]).toBe("ada@example.com");
		expect(typeof params![2]).toBe("string");
		expect(params![2]).toMatch(/^\$2[aby]\$/);
		expect(params![3]).toBe("Ada");
		expect(params![4]).toBe("Lovelace");
	});

	it("returns EMAIL_TAKEN when unique constraint fails", async () => {
		vi.mocked(executeMutation).mockRejectedValueOnce(
			new Error("D1_ERROR: UNIQUE constraint failed: idx_users_email"),
		);

		const result = await createUser(mockDb, {
			firstName: "A",
			lastName: "B",
			email: "dup@example.com",
			password: "password123",
			role: "student",
		});

		expect(result).toEqual({ success: false, error: "EMAIL_TAKEN" });
	});

	it("returns INVALID_INPUT when first or last name is empty after trim", async () => {
		const result = await createUser(mockDb, {
			firstName: "   ",
			lastName: "Valid",
			email: "a@b.com",
			password: "password123",
			role: "student",
		});
		expect(result).toEqual({ success: false, error: "INVALID_INPUT" });
		expect(executeMutation).not.toHaveBeenCalled();
	});

	it("returns INVALID_ROLE when role is not faculty or student", async () => {
		const result = await createUser(mockDb, {
			firstName: "A",
			lastName: "B",
			email: "a@b.com",
			password: "password123",
			role: "admin",
		} as unknown as CreateUserInput);
		expect(result).toEqual({ success: false, error: "INVALID_ROLE" });
		expect(executeMutation).not.toHaveBeenCalled();
	});

	it("rethrows non-unique database errors", async () => {
		vi.mocked(executeMutation).mockRejectedValueOnce(
			new Error("connection reset"),
		);
		await expect(
			createUser(mockDb, {
				firstName: "A",
				lastName: "B",
				email: "ok@example.com",
				password: "password123",
				role: "student",
			}),
		).rejects.toThrow("connection reset");
	});
});

describe("findUserByEmail", () => {
	it("queries with normalized email", async () => {
		const row = {
			id: "1",
			email: "e@example.com",
			password_hash: "$2a$hash",
			first_name: "E",
			last_name: "E",
			role: "student" as const,
			created_at: "t1",
			updated_at: "t2",
			created_by: null,
			updated_by: null,
		};
		vi.mocked(executeQueryFirst).mockResolvedValueOnce(row);

		const found = await findUserByEmail(mockDb, " E@EXAMPLE.COM ");
		expect(found).toEqual(row);
		expect(executeQueryFirst).toHaveBeenCalledWith(
			mockDb,
			expect.stringContaining("WHERE email = ?"),
			["e@example.com"],
		);
	});

	it("returns null when no row", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce(null);
		expect(await findUserByEmail(mockDb, "none@x.com")).toBeNull();
	});

	it("returns null when role in row is invalid", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce({
			id: "1",
			email: "a@b.com",
			password_hash: "x",
			first_name: "A",
			last_name: "B",
			role: "hacker",
			created_at: "",
			updated_at: "",
			created_by: null,
			updated_by: null,
		});
		expect(await findUserByEmail(mockDb, "a@b.com")).toBeNull();
	});
});

describe("findUserById", () => {
	it("maps snake_case row to PublicUser", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce({
			id: "u1",
			email: "a@b.com",
			first_name: "Ann",
			last_name: "D",
			role: "faculty",
			created_at: "c",
			updated_at: "u",
			created_by: null,
			updated_by: null,
		});

		expect(await findUserById(mockDb, "u1")).toEqual({
			id: "u1",
			email: "a@b.com",
			firstName: "Ann",
			lastName: "D",
			role: "faculty",
			createdAt: "c",
			updatedAt: "u",
		});
	});
});
