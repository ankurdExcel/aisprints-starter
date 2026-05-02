import { describe, expect, it } from "vitest";

import { signupFormSchema } from "@/lib/auth/client-schemas";

describe("signupFormSchema", () => {
	it("rejects when password and confirmation differ", () => {
		const result = signupFormSchema.safeParse({
			firstName: "A",
			lastName: "B",
			email: "a@b.com",
			password: "password12",
			confirmPassword: "otherthing",
			role: "student",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const confirmIssue = result.error.flatten().fieldErrors.confirmPassword;
			expect(confirmIssue?.some((m) => /match/i.test(m ?? ""))).toBe(true);
		}
	});

	it("accepts when passwords match", () => {
		const result = signupFormSchema.safeParse({
			firstName: "A",
			lastName: "B",
			email: "a@b.com",
			password: "password12",
			confirmPassword: "password12",
			role: "faculty",
		});
		expect(result.success).toBe(true);
	});
});
