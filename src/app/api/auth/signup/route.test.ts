import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(),
}));

vi.mock("@/lib/services/user-service", () => ({
	createUser: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createUser } from "@/lib/services/user-service";
import { POST } from "./route";

const JWT_SECRET = "01234567890123456789012345678901";

beforeEach(() => {
	vi.clearAllMocks();
	process.env.JWT_SECRET = JWT_SECRET;
	vi.mocked(getCloudflareContext).mockResolvedValue({
		env: { tna_app_db: {} },
	} as never);
});

describe("POST /api/auth/signup", () => {
	it("returns 201 and Set-Cookie when createUser succeeds", async () => {
		vi.mocked(createUser).mockResolvedValue({
			success: true,
			user: {
				id: "u1",
				email: "a@b.com",
				firstName: "A",
				lastName: "B",
				role: "faculty",
				createdAt: "t",
				updatedAt: "t",
			},
		});

		const req = new Request("http://localhost/api/auth/signup", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				firstName: "A",
				lastName: "B",
				email: "a@b.com",
				password: "password1",
				role: "faculty",
			}),
		});

		const res = await POST(req);
		expect(res.status).toBe(201);
		const json = await res.json();
		expect(json.user.email).toBe("a@b.com");
		expect(res.headers.get("set-cookie")).toContain("qm_session=");
	});

	it("returns 409 when email is taken", async () => {
		vi.mocked(createUser).mockResolvedValue({
			success: false,
			error: "EMAIL_TAKEN",
		});

		const req = new Request("http://localhost/api/auth/signup", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				firstName: "A",
				lastName: "B",
				email: "dup@b.com",
				password: "password1",
				role: "student",
			}),
		});

		const res = await POST(req);
		expect(res.status).toBe(409);
	});

	it("returns 400 on validation failure", async () => {
		const req = new Request("http://localhost/api/auth/signup", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				firstName: "",
				lastName: "B",
				email: "not-an-email",
				password: "short",
				role: "student",
			}),
		});

		const res = await POST(req);
		expect(res.status).toBe(400);
	});

	it("returns 500 when JWT_SECRET is missing", async () => {
		delete process.env.JWT_SECRET;
		const req = new Request("http://localhost/api/auth/signup", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				firstName: "A",
				lastName: "B",
				email: "a@b.com",
				password: "password1",
				role: "student",
			}),
		});
		const res = await POST(req);
		expect(res.status).toBe(500);
		process.env.JWT_SECRET = JWT_SECRET;
	});
});
