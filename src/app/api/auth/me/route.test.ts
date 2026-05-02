import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(),
}));

vi.mock("@/lib/services/user-service", () => ({
	findUserById: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createSessionToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-constants";
import { findUserById } from "@/lib/services/user-service";
import { GET } from "./route";

const JWT_SECRET = "01234567890123456789012345678901";

beforeEach(() => {
	vi.clearAllMocks();
	process.env.JWT_SECRET = JWT_SECRET;
	vi.mocked(getCloudflareContext).mockResolvedValue({
		env: { tna_app_db: {} },
	} as never);
});

describe("GET /api/auth/me", () => {
	it("returns user when cookie token is valid", async () => {
		const token = await createSessionToken(
			{ sub: "u1", email: "a@b.com", role: "faculty" },
			JWT_SECRET,
		);
		vi.mocked(findUserById).mockResolvedValue({
			id: "u1",
			email: "a@b.com",
			firstName: "Ann",
			lastName: "D",
			role: "faculty",
			createdAt: "c",
			updatedAt: "u",
		});

		const req = new Request("http://localhost/api/auth/me", {
			headers: {
				cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
			},
		});

		const res = await GET(req);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			user: {
				id: "u1",
				email: "a@b.com",
				firstName: "Ann",
				lastName: "D",
				role: "faculty",
				createdAt: "c",
				updatedAt: "u",
			},
		});
	});

	it("returns 401 without cookie", async () => {
		const res = await GET(new Request("http://localhost/api/auth/me"));
		expect(res.status).toBe(401);
	});

	it("returns 401 when user was deleted", async () => {
		const token = await createSessionToken(
			{ sub: "gone", email: "a@b.com", role: "student" },
			JWT_SECRET,
		);
		vi.mocked(findUserById).mockResolvedValue(null);

		const req = new Request("http://localhost/api/auth/me", {
			headers: {
				cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
			},
		});

		const res = await GET(req);
		expect(res.status).toBe(401);
	});
});
