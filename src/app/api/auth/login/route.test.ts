import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(),
}));

vi.mock("@/lib/services/user-service", () => ({
	findUserByEmail: vi.fn(),
	userRowToPublicUser: vi.fn((row: {
		id: string;
		email: string;
		first_name: string;
		last_name: string;
		role: "faculty" | "student";
		created_at: string;
		updated_at: string;
		password_hash: string;
		created_by: null;
		updated_by: null;
	}) => ({
		id: row.id,
		email: row.email,
		firstName: row.first_name,
		lastName: row.last_name,
		role: row.role,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	})),
}));

vi.mock("@/lib/auth/password", () => ({
	verifyPassword: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { verifyPassword } from "@/lib/auth/password";
import { findUserByEmail } from "@/lib/services/user-service";
import { POST } from "./route";

const JWT_SECRET = "01234567890123456789012345678901";

beforeEach(() => {
	vi.clearAllMocks();
	process.env.JWT_SECRET = JWT_SECRET;
	vi.mocked(getCloudflareContext).mockResolvedValue({
		env: { tna_app_db: {} },
	} as never);
});

describe("POST /api/auth/login", () => {
	it("returns 200 and Set-Cookie when credentials match", async () => {
		vi.mocked(findUserByEmail).mockResolvedValue({
			id: "u1",
			email: "a@b.com",
			password_hash: "$2a$hashed",
			first_name: "A",
			last_name: "B",
			role: "student",
			created_at: "c",
			updated_at: "u",
			created_by: null,
			updated_by: null,
		});
		vi.mocked(verifyPassword).mockResolvedValue(true);

		const req = new Request("http://localhost/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "a@b.com", password: "right" }),
		});

		const res = await POST(req);
		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.user.id).toBe("u1");
		const sc = res.headers.get("set-cookie");
		expect(sc).toContain("qm_session=");
	});

	it("returns 401 when user is missing", async () => {
		vi.mocked(findUserByEmail).mockResolvedValue(null);

		const req = new Request("http://localhost/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "ghost@b.com", password: "any" }),
		});

		const res = await POST(req);
		expect(res.status).toBe(401);
		const json = await res.json();
		expect(json.message).toBe("Invalid email or password");
	});

	it("returns 401 when password does not match", async () => {
		vi.mocked(findUserByEmail).mockResolvedValue({
			id: "u1",
			email: "a@b.com",
			password_hash: "$2a$hash",
			first_name: "A",
			last_name: "B",
			role: "student",
			created_at: "c",
			updated_at: "u",
			created_by: null,
			updated_by: null,
		});
		vi.mocked(verifyPassword).mockResolvedValue(false);

		const req = new Request("http://localhost/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "a@b.com", password: "wrong" }),
		});

		const res = await POST(req);
		expect(res.status).toBe(401);
	});
});
