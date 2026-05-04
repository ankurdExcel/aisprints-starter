import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(),
}));

vi.mock("@/lib/services/user-service", () => ({
	findUserById: vi.fn(),
}));

vi.mock("@/lib/services/mcq-service", () => ({
	getMcqByIdForAuthor: vi.fn(),
	updateMcq: vi.fn(),
	deleteMcq: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createSessionToken } from "@/lib/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-constants";
import {
	deleteMcq,
	getMcqByIdForAuthor,
	updateMcq,
} from "@/lib/services/mcq-service";
import { findUserById } from "@/lib/services/user-service";
import { DELETE, GET, PATCH } from "./route";

const JWT_SECRET = "01234567890123456789012345678901";

async function facultyCookie() {
	const token = await createSessionToken(
		{ sub: "fac-1", email: "f@b.com", role: "faculty" },
		JWT_SECRET,
	);
	return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
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

describe("GET /api/faculty/mcqs/[id]", () => {
	it("returns 404 when MCQ is missing or not owned", async () => {
		vi.mocked(getMcqByIdForAuthor).mockResolvedValue({
			success: false,
			error: "NOT_FOUND",
		});

		const cookie = await facultyCookie();
		const res = await GET(
			new Request("http://localhost/api/faculty/mcqs/q-missing", {
				headers: { cookie },
			}),
			{ params: Promise.resolve({ id: "q-missing" }) },
		);
		expect(res.status).toBe(404);
	});

	it("returns 200 with mcq payload", async () => {
		vi.mocked(getMcqByIdForAuthor).mockResolvedValue({
			success: true,
			mcq: {
				id: "q1",
				prompt: "Stem",
				authorUserId: "fac-1",
				createdAt: "c",
				updatedAt: "u",
				options: [
					{
						id: "o1",
						label: null,
						body: "Yes",
						isCorrect: true,
						sortOrder: 0,
					},
				],
			},
		});

		const cookie = await facultyCookie();
		const res = await GET(
			new Request("http://localhost/api/faculty/mcqs/q1", {
				headers: { cookie },
			}),
			{ params: Promise.resolve({ id: "q1" }) },
		);

		expect(res.status).toBe(200);
		const json = await res.json();
		expect(json.mcq.id).toBe("q1");
		expect(json.mcq.options).toHaveLength(1);
	});
});

describe("PATCH /api/faculty/mcqs/[id]", () => {
	it("returns 404 when update reports not found", async () => {
		vi.mocked(updateMcq).mockResolvedValue({ success: false, error: "NOT_FOUND" });

		const cookie = await facultyCookie();
		const res = await PATCH(
			new Request("http://localhost/api/faculty/mcqs/q1", {
				method: "PATCH",
				headers: { cookie, "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt: "New",
					options: [
						{ body: "a", isCorrect: true },
						{ body: "b", isCorrect: false },
					],
				}),
			}),
			{ params: Promise.resolve({ id: "q1" }) },
		);
		expect(res.status).toBe(404);
	});

	it("returns 200 when update succeeds", async () => {
		vi.mocked(updateMcq).mockResolvedValue({ success: true });

		const cookie = await facultyCookie();
		const res = await PATCH(
			new Request("http://localhost/api/faculty/mcqs/q1", {
				method: "PATCH",
				headers: { cookie, "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt: "New",
					options: [
						{ body: "a", isCorrect: true },
						{ body: "b", isCorrect: false },
					],
				}),
			}),
			{ params: Promise.resolve({ id: "q1" }) },
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
		expect(updateMcq).toHaveBeenCalledWith(
			{},
			expect.objectContaining({ id: "q1", authorUserId: "fac-1" }),
		);
	});
});

describe("DELETE /api/faculty/mcqs/[id]", () => {
	it("returns 204 when delete succeeds", async () => {
		vi.mocked(deleteMcq).mockResolvedValue({ success: true });

		const cookie = await facultyCookie();
		const res = await DELETE(
			new Request("http://localhost/api/faculty/mcqs/q1", {
				method: "DELETE",
				headers: { cookie },
			}),
			{ params: Promise.resolve({ id: "q1" }) },
		);
		expect(res.status).toBe(204);
		expect(deleteMcq).toHaveBeenCalledWith(
			{},
			{ id: "q1", authorUserId: "fac-1" },
		);
	});

	it("returns 404 when delete reports not found", async () => {
		vi.mocked(deleteMcq).mockResolvedValue({ success: false, error: "NOT_FOUND" });

		const cookie = await facultyCookie();
		const res = await DELETE(
			new Request("http://localhost/api/faculty/mcqs/q1", {
				method: "DELETE",
				headers: { cookie },
			}),
			{ params: Promise.resolve({ id: "q1" }) },
		);
		expect(res.status).toBe(404);
	});
});
