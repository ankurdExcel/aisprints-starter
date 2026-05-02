import { beforeEach, describe, expect, it, vi } from "vitest";
import * as jose from "jose";
import { createSessionToken, verifySessionToken } from "./jwt";

const SECRET =
	"unit-test-jwt-secret-must-be-32+chars!!"; // 32+ characters

beforeEach(() => {
	vi.clearAllMocks();
});

describe("createSessionToken / verifySessionToken", () => {
	it("round-trips claims sub, email, role, iat, exp", async () => {
		const token = await createSessionToken(
			{
				sub: "user-1",
				email: "Ada@Example.com",
				role: "faculty",
			},
			SECRET,
			"2h",
		);
		const payload = await verifySessionToken(token, SECRET);
		expect(payload.sub).toBe("user-1");
		expect(payload.email).toBe("Ada@Example.com");
		expect(payload.role).toBe("faculty");
		expect(typeof payload.iat).toBe("number");
		expect(typeof payload.exp).toBe("number");
		expect(payload.exp).toBeGreaterThan(payload.iat);
	});

	it("rejects verification with the wrong secret", async () => {
		const token = await createSessionToken(
			{ sub: "u", email: "e@e.com", role: "student" },
			SECRET,
		);
		await expect(
			verifySessionToken(
				token,
				"different-secret-string-32chars!!",
			),
		).rejects.toThrow();
	});

	it("rejects expired tokens", async () => {
		const key = new TextEncoder().encode(SECRET);
		const token = await new jose.SignJWT({
			email: "old@e.com",
			role: "student",
		})
			.setProtectedHeader({ alg: "HS256" })
			.setSubject("u-old")
			.setIssuedAt()
			.setExpirationTime(Math.floor(Date.now() / 1000) - 60)
			.sign(key);

		await expect(verifySessionToken(token, SECRET)).rejects.toMatchObject({
			code: "ERR_JWT_EXPIRED",
		});
	});

	it("rejects malformed payload role", async () => {
		const key = new TextEncoder().encode(SECRET);
		const token = await new jose.SignJWT({
			email: "e@e.com",
			role: "admin",
		})
			.setProtectedHeader({ alg: "HS256" })
			.setSubject("u1")
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(key);

		await expect(verifySessionToken(token, SECRET)).rejects.toThrow(
			"Invalid session token payload",
		);
	});

	it("throws when secret is too short for signing", async () => {
		await expect(
			createSessionToken(
				{ sub: "a", email: "a@b.com", role: "student" },
				"short",
			),
		).rejects.toThrow(/32 characters/);
	});
});
