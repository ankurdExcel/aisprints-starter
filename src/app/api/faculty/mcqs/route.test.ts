import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(),
}));

vi.mock("@/lib/services/user-service", () => ({
	findUserById: vi.fn(),
}));

vi.mock("@/lib/services/mcq-service", () => ({
	listMcqsForAuthor: vi.fn(),
	createMcq: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createSessionToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-constants";
import { createMcq, listMcqsForAuthor } from "@/lib/services/mcq-service";
import { findUserById } from "@/lib/services/user-service";
import { GET, POST } from "./route";

const JWT_SECRET = "01234567890123456789012345678901";

function facultyCookie() {
	return createSessionToken(
		{ sub: "fac-1", email: "f@b.com", role: "faculty" },
		JWT_SECRET,
	).then((token) => `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`);
}

beforeEach(() => {
	vi.clearAllMocks();
	process.env.JWT_SECRET = JWT_SECRET;
	vi.mocked(getCloudflareContext).mockResolvedValue({
		env: { tna_app_db: {} },
	} as never);
	vi.mocked(findUserById).mockResolvedValue({
		id: "fac-1",
		email: "f@b.com",
		firstName: "F",
		lastName: "A",
		role: "faculty",
		createdAt: "c",
		updatedAt: "u",
	});
});

describe("GET /api/faculty/mcqs", () => {
	it("returns 401 without session cookie", async () => {
		const res = await GET(new Request("http://localhost/api/faculty/mcqs"));
		expect(res.status).toBe(401);
	});

	it("returns 403 when user is not faculty", async () => {
		const token = await createSessionToken(
			{ sub: "stu-1", email: "s@b.com", role: "student" },
			JWT_SECRET,
		);
		vi.mocked(findUserById).mockResolvedValue({
			id: "stu-1",
			email: "s@b.com",
			firstName: "S",
			lastName: "T",
			role: "student",
			createdAt: "c",
			updatedAt: "u",
		});

		const res = await GET(
			new Request("http://localhost/api/faculty/mcqs", {
				headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` },
			}),
		);
		expect(res.status).toBe(403);
	});

	it("returns 400 for invalid query params", async () => {
		const cookie = await facultyCookie();
		const res = await GET(
			new Request("http://localhost/api/faculty/mcqs?page=0", {
				headers: { cookie },
			}),
		);
		expect(res.status).toBe(400);
		const json = await res.json();
		expect(json.message).toBe("Validation failed");
	});

	it("calls listMcqsForAuthor with default pageSize 15", async () => {
		vi.mocked(listMcqsForAuthor).mockResolvedValue({
			items: [],
			total: 0,
			page: 1,
			pageSize: 15,
		});

		const cookie = await facultyCookie();
		const res = await GET(
			new Request("http://localhost/api/faculty/mcqs", {
				headers: { cookie },
			}),
		);

		expect(res.status).toBe(200);
		expect(listMcqsForAuthor).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				authorUserId: "fac-1",
				page: 1,
				pageSize: 15,
				sort: "updated_at_desc",
			}),
		);
		const call = vi.mocked(listMcqsForAuthor).mock.calls[0]![1];
		expect(call.q).toBeUndefined();
	});

	it("passes search and pagination to listMcqsForAuthor", async () => {
		vi.mocked(listMcqsForAuthor).mockResolvedValue({
			items: [
				{
					id: "q1",
					prompt: "Hi",
					optionCount: 2,
					updatedAt: "t",
				},
			],
			total: 1,
			page: 2,
			pageSize: 10,
		});

		const cookie = await facultyCookie();
		const res = await GET(
			new Request(
				"http://localhost/api/faculty/mcqs?page=2&pageSize=10&q=Hi&sort=prompt_asc",
				{ headers: { cookie } },
			),
		);

		expect(res.status).toBe(200);
		expect(listMcqsForAuthor).toHaveBeenCalledWith(
			{},
			{
				authorUserId: "fac-1",
				page: 2,
				pageSize: 10,
				sort: "prompt_asc",
				q: "Hi",
			},
		);
		expect(await res.json()).toEqual({
			items: [
				{
					id: "q1",
					prompt: "Hi",
					optionCount: 2,
					updatedAt: "t",
				},
			],
			total: 1,
			page: 2,
			pageSize: 10,
		});
	});
});

describe("POST /api/faculty/mcqs", () => {
	it("returns 201 and id when create succeeds", async () => {
		vi.mocked(createMcq).mockResolvedValue({ success: true, id: "new-q" });

		const cookie = await facultyCookie();
		const res = await POST(
			new Request("http://localhost/api/faculty/mcqs", {
				method: "POST",
				headers: { cookie, "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt: "What?",
					options: [
						{ body: "A", isCorrect: false },
						{ body: "B", isCorrect: true },
					],
				}),
			}),
		);

		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({ id: "new-q" });
		expect(createMcq).toHaveBeenCalledWith(
			{},
			expect.objectContaining({
				authorUserId: "fac-1",
				prompt: "What?",
				options: [
					{ body: "A", isCorrect: false },
					{ body: "B", isCorrect: true },
				],
			}),
		);
	});

	it("returns 400 when Zod validation fails", async () => {
		const cookie = await facultyCookie();
		const res = await POST(
			new Request("http://localhost/api/faculty/mcqs", {
				method: "POST",
				headers: { cookie, "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt: "",
					options: [
						{ body: "A", isCorrect: true },
						{ body: "B", isCorrect: false },
					],
				}),
			}),
		);
		expect(res.status).toBe(400);
	});

	it("returns 400 when two options are marked correct", async () => {
		const cookie = await facultyCookie();
		const res = await POST(
			new Request("http://localhost/api/faculty/mcqs", {
				method: "POST",
				headers: { cookie, "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt: "Q",
					options: [
						{ body: "A", isCorrect: true },
						{ body: "B", isCorrect: true },
					],
				}),
			}),
		);
		expect(res.status).toBe(400);
	});

	it("returns 400 when service rejects options", async () => {
		vi.mocked(createMcq).mockResolvedValue({
			success: false,
			error: "INVALID_OPTIONS",
		});

		const cookie = await facultyCookie();
		const res = await POST(
			new Request("http://localhost/api/faculty/mcqs", {
				method: "POST",
				headers: { cookie, "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt: "Q",
					options: [
						{ body: "A", isCorrect: false },
						{ body: "B", isCorrect: true },
					],
				}),
			}),
		);
		expect(res.status).toBe(400);
	});
});
