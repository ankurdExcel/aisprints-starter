import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/d1-client", () => ({
	executeBatch: vi.fn(),
	executeMutation: vi.fn(),
	executeQuery: vi.fn(),
	executeQueryFirst: vi.fn(),
	generateId: vi.fn(),
}));

import {
	executeBatch,
	executeMutation,
	executeQuery,
	executeQueryFirst,
	generateId,
} from "@/lib/d1-client";
import {
	createMcq,
	deleteMcq,
	getMcqByIdForAuthor,
	getOrCreateImplicitQuizId,
	listMcqsForAuthor,
	updateMcq,
} from "./mcq-service";

const mockDb = {} as D1Database;

let idSeq = 0;
function nextId(prefix: string) {
	idSeq += 1;
	return `${prefix}-${idSeq}`;
}

beforeEach(() => {
	vi.clearAllMocks();
	idSeq = 0;
	vi.mocked(generateId).mockImplementation(() => nextId("id"));
});

describe("listMcqsForAuthor", () => {
	it("returns empty list and total 0 when count is zero", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce({ c: 0 });
		vi.mocked(executeQuery).mockResolvedValueOnce([]);

		const result = await listMcqsForAuthor(mockDb, {
			authorUserId: "author-1",
		});

		expect(result).toEqual({
			items: [],
			total: 0,
			page: 1,
			pageSize: 15,
		});
		expect(executeQueryFirst).toHaveBeenCalledTimes(1);
		const [, countSql, countParams] = vi.mocked(executeQueryFirst).mock
			.calls[0]!;
		expect(countSql).toContain("COUNT(*)");
		expect(countSql).toContain("author_user_id = ?");
		expect(countParams).toEqual(["author-1"]);
		expect(executeQuery).toHaveBeenCalledTimes(1);
		const [, listSql, listParams] = vi.mocked(executeQuery).mock.calls[0]!;
		expect(listSql).toContain("LIMIT ?");
		expect(listSql).toContain("OFFSET ?");
		expect(listParams?.slice(-2)).toEqual([15, 0]);
	});

	it("uses page and pageSize with correct offset", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce({ c: 40 });
		vi.mocked(executeQuery).mockResolvedValueOnce([]);

		await listMcqsForAuthor(mockDb, {
			authorUserId: "a",
			page: 3,
			pageSize: 10,
		});

		const [, , listParams] = vi.mocked(executeQuery).mock.calls[0]!;
		expect(listParams?.slice(-2)).toEqual([10, 20]);
	});

	it("caps pageSize at 50", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce({ c: 0 });
		vi.mocked(executeQuery).mockResolvedValueOnce([]);

		await listMcqsForAuthor(mockDb, {
			authorUserId: "a",
			page: 1,
			pageSize: 999,
		});

		const [, , listParams] = vi.mocked(executeQuery).mock.calls[0]!;
		expect(listParams?.slice(-2)?.[0]).toBe(50);
	});

	it("adds LIKE filter when q is non-empty", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce({ c: 1 });
		vi.mocked(executeQuery).mockResolvedValueOnce([
			{
				id: "q1",
				prompt: "Hello",
				updated_at: "t",
				option_count: 2,
			},
		]);

		await listMcqsForAuthor(mockDb, {
			authorUserId: "a",
			q: "ell",
		});

		const countCall = vi.mocked(executeQueryFirst).mock.calls[0]!;
		expect(countCall[1]).toContain("LIKE");
		expect(countCall[2]).toEqual(["a", "%ell%"]);
	});

	it("uses prompt_asc order when sort is prompt_asc", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce({ c: 0 });
		vi.mocked(executeQuery).mockResolvedValueOnce([]);

		await listMcqsForAuthor(mockDb, {
			authorUserId: "a",
			sort: "prompt_asc",
		});

		const [, listSql] = vi.mocked(executeQuery).mock.calls[0]!;
		expect(listSql).toContain("COLLATE NOCASE ASC");
	});

	it("maps rows to McqListItem", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce({ c: 1 });
		vi.mocked(executeQuery).mockResolvedValueOnce([
			{
				id: "q1",
				prompt: "Q?",
				updated_at: "2026-01-01T00:00:00.000Z",
				option_count: 3,
			},
		]);

		const result = await listMcqsForAuthor(mockDb, {
			authorUserId: "a",
		});

		expect(result.items[0]).toEqual({
			id: "q1",
			prompt: "Q?",
			optionCount: 3,
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
	});
});

describe("getMcqByIdForAuthor", () => {
	it("returns NOT_FOUND when question missing", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce(null);

		const r = await getMcqByIdForAuthor(mockDb, {
			id: "missing",
			authorUserId: "a",
		});
		expect(r).toEqual({ success: false, error: "NOT_FOUND" });
	});

	it("returns FORBIDDEN when author mismatch", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce({
			id: "q1",
			author_user_id: "other",
			prompt: "p",
			created_at: "c",
			updated_at: "u",
		});

		const r = await getMcqByIdForAuthor(mockDb, {
			id: "q1",
			authorUserId: "a",
		});
		expect(r).toEqual({ success: false, error: "FORBIDDEN" });
		expect(executeQuery).not.toHaveBeenCalled();
	});

	it("returns mcq with options and isCorrect flags", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce({
			id: "q1",
			author_user_id: "a",
			prompt: "Stem",
			created_at: "c1",
			updated_at: "u1",
		});
		vi.mocked(executeQuery).mockResolvedValueOnce([
			{
				id: "o1",
				label: "A",
				body: "one",
				is_correct: 0,
				sort_order: 0,
			},
			{
				id: "o2",
				label: null,
				body: "two",
				is_correct: 1,
				sort_order: 1,
			},
		]);

		const r = await getMcqByIdForAuthor(mockDb, {
			id: "q1",
			authorUserId: "a",
		});
		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.mcq.prompt).toBe("Stem");
		expect(r.mcq.options).toHaveLength(2);
		expect(r.mcq.options[1]!.isCorrect).toBe(true);
	});
});

describe("getOrCreateImplicitQuizId", () => {
	it("returns existing quiz id without insert", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce({ id: "quiz-existing" });

		const id = await getOrCreateImplicitQuizId(mockDb, "owner-1");
		expect(id).toBe("quiz-existing");
		expect(executeMutation).not.toHaveBeenCalled();
	});

	it("inserts quiz when none exists", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce(null);
		vi.mocked(executeMutation).mockResolvedValueOnce({
			success: true,
			meta: {},
			results: [],
		});

		const id = await getOrCreateImplicitQuizId(mockDb, "owner-1");
		expect(id).toMatch(/^id-/);
		expect(executeMutation).toHaveBeenCalledTimes(1);
		const [, sql, params] = vi.mocked(executeMutation).mock.calls[0]!;
		expect(sql).toContain("INSERT INTO quizzes");
		expect(params?.[2]).toBe("owner-1");
		expect(params?.[3]).toBeNull();
	});
});

describe("createMcq", () => {
	it("returns INVALID_PROMPT for blank prompt", async () => {
		const r = await createMcq(mockDb, {
			authorUserId: "a",
			prompt: "   ",
			options: [
				{ body: "a", isCorrect: false },
				{ body: "b", isCorrect: true },
			],
		});
		expect(r).toEqual({ success: false, error: "INVALID_PROMPT" });
		expect(executeBatch).not.toHaveBeenCalled();
	});

	it("returns INVALID_OPTIONS when fewer than two options", async () => {
		const r = await createMcq(mockDb, {
			authorUserId: "a",
			prompt: "Q",
			options: [{ body: "only", isCorrect: true }],
		});
		expect(r).toEqual({ success: false, error: "INVALID_OPTIONS" });
	});

	it("returns INVALID_OPTIONS when zero correct answers", async () => {
		const r = await createMcq(mockDb, {
			authorUserId: "a",
			prompt: "Q",
			options: [
				{ body: "a", isCorrect: false },
				{ body: "b", isCorrect: false },
			],
		});
		expect(r).toEqual({ success: false, error: "INVALID_OPTIONS" });
	});

	it("returns INVALID_OPTIONS when two correct answers", async () => {
		const r = await createMcq(mockDb, {
			authorUserId: "a",
			prompt: "Q",
			options: [
				{ body: "a", isCorrect: true },
				{ body: "b", isCorrect: true },
			],
		});
		expect(r).toEqual({ success: false, error: "INVALID_OPTIONS" });
	});

	it("batches question, options, and quiz_questions after ensuring quiz", async () => {
		vi.mocked(executeQueryFirst)
			.mockResolvedValueOnce({ id: "quiz-1" })
			.mockResolvedValueOnce({ next_sort: 2 });
		vi.mocked(executeBatch).mockResolvedValueOnce([]);

		const r = await createMcq(mockDb, {
			authorUserId: "fac-1",
			prompt: "What is 2+2?",
			options: [
				{ body: "3", isCorrect: false },
				{ body: "4", isCorrect: true },
			],
		});

		expect(r.success).toBe(true);
		if (!r.success) return;
		expect(r.id).toMatch(/^id-/);

		expect(executeBatch).toHaveBeenCalledTimes(1);
		const batch = vi.mocked(executeBatch).mock.calls[0]![1];
		expect(batch.length).toBe(4);
		expect(batch[0]!.sql).toContain("INSERT INTO mcq_questions");
		expect(batch[1]!.sql).toContain("INSERT INTO mcq_options");
		expect(batch[2]!.sql).toContain("INSERT INTO mcq_options");
		expect(batch[3]!.sql).toContain("INSERT INTO quiz_questions");
		expect(batch[3]!.params?.[0]).toBe("quiz-1");
		expect(batch[3]!.params?.[2]).toBe(2);
	});
});

describe("updateMcq", () => {
	it("returns NOT_FOUND when id missing", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce(null);

		const r = await updateMcq(mockDb, {
			id: "x",
			authorUserId: "a",
			prompt: "P",
			options: [
				{ body: "a", isCorrect: true },
				{ body: "b", isCorrect: false },
			],
		});
		expect(r).toEqual({ success: false, error: "NOT_FOUND" });
	});

	it("returns FORBIDDEN when author mismatch", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce({
			author_user_id: "other",
		});

		const r = await updateMcq(mockDb, {
			id: "q1",
			authorUserId: "a",
			prompt: "P",
			options: [
				{ body: "a", isCorrect: true },
				{ body: "b", isCorrect: false },
			],
		});
		expect(r).toEqual({ success: false, error: "FORBIDDEN" });
		expect(executeBatch).not.toHaveBeenCalled();
	});

	it("runs update, delete options, and re-insert options in batch", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce({
			author_user_id: "a",
		});
		vi.mocked(executeBatch).mockResolvedValueOnce([]);

		const r = await updateMcq(mockDb, {
			id: "q1",
			authorUserId: "a",
			prompt: "New stem",
			options: [
				{ body: "x", isCorrect: false },
				{ body: "y", isCorrect: true },
			],
		});
		expect(r).toEqual({ success: true });

		const batch = vi.mocked(executeBatch).mock.calls[0]![1];
		expect(batch[0]!.sql).toContain("UPDATE mcq_questions");
		expect(batch[1]!.sql).toContain("DELETE FROM mcq_options");
		expect(batch[2]!.sql).toContain("INSERT INTO mcq_options");
		expect(batch[3]!.sql).toContain("INSERT INTO mcq_options");
	});
});

describe("deleteMcq", () => {
	it("returns NOT_FOUND when missing", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce(null);
		const r = await deleteMcq(mockDb, { id: "x", authorUserId: "a" });
		expect(r).toEqual({ success: false, error: "NOT_FOUND" });
	});

	it("returns FORBIDDEN when author mismatch", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce({
			author_user_id: "other",
		});
		const r = await deleteMcq(mockDb, { id: "q1", authorUserId: "a" });
		expect(r).toEqual({ success: false, error: "FORBIDDEN" });
		expect(executeMutation).not.toHaveBeenCalled();
	});

	it("deletes question when owner matches", async () => {
		vi.mocked(executeQueryFirst).mockResolvedValueOnce({
			author_user_id: "a",
		});
		vi.mocked(executeMutation).mockResolvedValueOnce({
			success: true,
			meta: {},
			results: [],
		});

		const r = await deleteMcq(mockDb, { id: "q1", authorUserId: "a" });
		expect(r).toEqual({ success: true });
		expect(executeMutation).toHaveBeenCalledWith(
			mockDb,
			expect.stringContaining("DELETE FROM mcq_questions"),
			["q1"],
		);
	});
});
