import { describe, expect, it } from "vitest";
import { loginBodySchema, signupBodySchema } from "./auth-schemas";

describe("signupBodySchema", () => {
	it("normalizes email to lowercase", () => {
		const r = signupBodySchema.safeParse({
			firstName: "A",
			lastName: "B",
			email: "Test@Example.COM",
			password: "abcdefgh",
			role: "student",
		});
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.email).toBe("test@example.com");
	});

	it("fails short password", () => {
		const r = signupBodySchema.safeParse({
			firstName: "A",
			lastName: "B",
			email: "a@b.com",
			password: "short",
			role: "faculty",
		});
		expect(r.success).toBe(false);
	});
});

describe("loginBodySchema", () => {
	it("normalizes email", () => {
		const r = loginBodySchema.safeParse({
			email: "  User@Example.COM  ",
			password: "any",
		});
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.email).toBe("user@example.com");
	});
});
