import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "./password";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("hashPassword / verifyPassword", () => {
	it("verifies a hash produced for the same password", async () => {
		const hash = await hashPassword("correct-horse-battery-staple", 4);
		expect(hash).not.toBe("correct-horse-battery-staple");
		expect(hash.startsWith("$2")).toBe(true);
		expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(
			true,
		);
	});

	it("rejects a wrong password against the hash", async () => {
		const hash = await hashPassword("secret-value", 4);
		expect(await verifyPassword("wrong-guess", hash)).toBe(false);
	});

	it("rejects garbage as hash", async () => {
		expect(await verifyPassword("any", "not-a-bcrypt-hash")).toBe(false);
	});
});
