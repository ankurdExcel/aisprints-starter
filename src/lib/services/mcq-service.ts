import {
	executeBatch,
	executeMutation,
	executeQuery,
	executeQueryFirst,
	generateId,
} from "@/lib/d1-client";

const DEFAULT_QUIZ_TITLE = "Default quiz";
const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 50;

export type McqSortField =
	| "updated_at_desc"
	| "updated_at_asc"
	| "prompt_asc"
	| "prompt_desc";

export type ListMcqsInput = {
	authorUserId: string;
	page?: number;
	pageSize?: number;
	sort?: McqSortField;
	/** Substring match on prompt (case-insensitive). */
	q?: string;
};

export type McqListItem = {
	id: string;
	prompt: string;
	optionCount: number;
	updatedAt: string;
};

export type ListMcqsResult = {
	items: McqListItem[];
	total: number;
	page: number;
	pageSize: number;
};

export type McqOptionInput = {
	body: string;
	isCorrect: boolean;
};

export type CreateMcqInput = {
	authorUserId: string;
	actorUserId?: string | null;
	prompt: string;
	options: McqOptionInput[];
};

export type CreateMcqResult =
	| { success: true; id: string }
	| { success: false; error: "INVALID_OPTIONS" | "INVALID_PROMPT" };

export type UpdateMcqInput = {
	id: string;
	authorUserId: string;
	actorUserId?: string | null;
	prompt: string;
	options: McqOptionInput[];
};

export type UpdateMcqResult =
	| { success: true }
	| {
			success: false;
			error:
				| "NOT_FOUND"
				| "FORBIDDEN"
				| "INVALID_OPTIONS"
				| "INVALID_PROMPT";
	  };

export type DeleteMcqResult =
	| { success: true }
	| { success: false; error: "NOT_FOUND" | "FORBIDDEN" };

export type McqOptionDetail = {
	id: string;
	label: string | null;
	body: string;
	isCorrect: boolean;
	sortOrder: number;
};

export type McqDetail = {
	id: string;
	prompt: string;
	authorUserId: string;
	createdAt: string;
	updatedAt: string;
	options: McqOptionDetail[];
};

export type GetMcqByIdResult =
	| { success: true; mcq: McqDetail }
	| { success: false; error: "NOT_FOUND" | "FORBIDDEN" };

type QuestionRow = {
	id: string;
	author_user_id: string;
	prompt: string;
	created_at: string;
	updated_at: string;
};

type OptionRow = {
	id: string;
	label: string | null;
	body: string;
	is_correct: number;
	sort_order: number;
};

type ListRow = {
	id: string;
	prompt: string;
	updated_at: string;
	option_count: number;
};

type CountRow = {
	c: number;
};

type QuizIdRow = {
	id: string;
};

type SortRow = {
	next_sort: number;
};

function normalizePage(page: number | undefined): number {
	const p = page ?? 1;
	return Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1;
}

function normalizePageSize(pageSize: number | undefined): number {
	const s = pageSize ?? DEFAULT_PAGE_SIZE;
	if (!Number.isFinite(s)) return DEFAULT_PAGE_SIZE;
	const n = Math.floor(s);
	return Math.min(MAX_PAGE_SIZE, Math.max(1, n));
}

function orderByClause(sort: McqSortField | undefined): string {
	switch (sort ?? "updated_at_desc") {
		case "updated_at_asc":
			return "q.updated_at ASC";
		case "prompt_asc":
			return "q.prompt COLLATE NOCASE ASC";
		case "prompt_desc":
			return "q.prompt COLLATE NOCASE DESC";
		case "updated_at_desc":
		default:
			return "q.updated_at DESC";
	}
}

function validateOptions(
	options: McqOptionInput[],
): { ok: true } | { ok: false; error: "INVALID_OPTIONS" } {
	if (!Array.isArray(options) || options.length < 2) {
		return { ok: false, error: "INVALID_OPTIONS" };
	}
	let correct = 0;
	for (const o of options) {
		if (typeof o.body !== "string" || !o.body.trim()) {
			return { ok: false, error: "INVALID_OPTIONS" };
		}
		if (o.isCorrect) correct++;
	}
	if (correct !== 1) return { ok: false, error: "INVALID_OPTIONS" };
	return { ok: true };
}

function validatePrompt(prompt: string): boolean {
	return typeof prompt === "string" && prompt.trim().length > 0;
}

/** Escape `%` and `_` for SQL LIKE with ESCAPE '\\'. */
function likePattern(q: string): string {
	const trimmed = q.trim();
	const escaped = trimmed
		.replace(/\\/g, "\\\\")
		.replace(/%/g, "\\%")
		.replace(/_/g, "\\_");
	return `%${escaped}%`;
}

/**
 * Returns the faculty's single implicit quiz id, creating the row if missing.
 */
export async function getOrCreateImplicitQuizId(
	db: D1Database,
	ownerUserId: string,
): Promise<string> {
	const existing = await executeQueryFirst<QuizIdRow>(
		db,
		`SELECT id FROM quizzes WHERE owner_user_id = ?`,
		[ownerUserId],
	);
	if (existing) return existing.id;

	const quizId = generateId();
	const now = new Date().toISOString();
	await executeMutation(
		db,
		`INSERT INTO quizzes (
      id, title, owner_user_id, max_attempts,
      created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			quizId,
			DEFAULT_QUIZ_TITLE,
			ownerUserId,
			null,
			now,
			now,
			null,
			null,
		],
	);
	return quizId;
}

async function nextQuizQuestionSortOrder(
	db: D1Database,
	quizId: string,
): Promise<number> {
	const row = await executeQueryFirst<SortRow>(
		db,
		`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort
     FROM quiz_questions WHERE quiz_id = ?`,
		[quizId],
	);
	return row?.next_sort ?? 0;
}

export async function listMcqsForAuthor(
	db: D1Database,
	input: ListMcqsInput,
): Promise<ListMcqsResult> {
	const page = normalizePage(input.page);
	const pageSize = normalizePageSize(input.pageSize);
	const offset = (page - 1) * pageSize;
	const orderBy = orderByClause(input.sort);
	const qTrim = (input.q ?? "").trim();

	const whereParts = ["q.author_user_id = ?"];
	const params: unknown[] = [input.authorUserId];

	if (qTrim.length > 0) {
		whereParts.push(`LOWER(q.prompt) LIKE LOWER(?) ESCAPE '\\'`);
		params.push(likePattern(qTrim));
	}
	const whereSql = whereParts.join(" AND ");

	const countSql = `
    SELECT COUNT(*) AS c FROM mcq_questions q WHERE ${whereSql}
  `;
	const countRow = await executeQueryFirst<CountRow>(db, countSql, params);
	const total = Number(countRow?.c ?? 0);

	const listSql = `
    SELECT q.id, q.prompt, q.updated_at,
           (SELECT COUNT(*) FROM mcq_options o WHERE o.question_id = q.id) AS option_count
    FROM mcq_questions q
    WHERE ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;
	const listParams = [...params, pageSize, offset];
	const rows = await executeQuery<ListRow>(db, listSql, listParams);

	const items: McqListItem[] = rows.map((r) => ({
		id: r.id,
		prompt: r.prompt,
		optionCount: r.option_count,
		updatedAt: r.updated_at,
	}));

	return { items, total, page, pageSize };
}

export async function getMcqByIdForAuthor(
	db: D1Database,
	args: { id: string; authorUserId: string },
): Promise<GetMcqByIdResult> {
	const row = await executeQueryFirst<QuestionRow>(
		db,
		`SELECT id, author_user_id, prompt, created_at, updated_at
     FROM mcq_questions WHERE id = ?`,
		[args.id],
	);
	if (!row) return { success: false, error: "NOT_FOUND" };
	if (row.author_user_id !== args.authorUserId) {
		return { success: false, error: "FORBIDDEN" };
	}

	const optRows = await executeQuery<OptionRow>(
		db,
		`SELECT id, label, body, is_correct, sort_order
     FROM mcq_options WHERE question_id = ?
     ORDER BY sort_order ASC, id ASC`,
		[args.id],
	);

	const options: McqOptionDetail[] = optRows.map((o) => ({
		id: o.id,
		label: o.label,
		body: o.body,
		isCorrect: o.is_correct === 1,
		sortOrder: o.sort_order,
	}));

	return {
		success: true,
		mcq: {
			id: row.id,
			prompt: row.prompt,
			authorUserId: row.author_user_id,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			options,
		},
	};
}

export async function createMcq(
	db: D1Database,
	input: CreateMcqInput,
): Promise<CreateMcqResult> {
	if (!validatePrompt(input.prompt)) {
		return { success: false, error: "INVALID_PROMPT" };
	}
	const v = validateOptions(input.options);
	if (!v.ok) return { success: false, error: v.error };

	const actor = input.actorUserId ?? input.authorUserId;
	const quizId = await getOrCreateImplicitQuizId(db, input.authorUserId);
	const sortOrder = await nextQuizQuestionSortOrder(db, quizId);
	const questionId = generateId();
	const now = new Date().toISOString();

	const statements: {
		sql: string;
		params?: unknown[];
	}[] = [
		{
			sql: `INSERT INTO mcq_questions (
          id, author_user_id, prompt,
          created_at, updated_at, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			params: [
				questionId,
				input.authorUserId,
				input.prompt.trim(),
				now,
				now,
				actor,
				actor,
			],
		},
	];

	let oi = 0;
	for (const o of input.options) {
		const optionId = generateId();
		statements.push({
			sql: `INSERT INTO mcq_options (
            id, question_id, label, body, is_correct, sort_order,
            created_at, updated_at, created_by, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			params: [
				optionId,
				questionId,
				null,
				o.body.trim(),
				o.isCorrect ? 1 : 0,
				oi++,
				now,
				now,
				actor,
				actor,
			],
		});
	}

	statements.push({
		sql: `INSERT INTO quiz_questions (
        quiz_id, question_id, sort_order,
        created_at, updated_at, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		params: [quizId, questionId, sortOrder, now, now, actor, actor],
	});

	await executeBatch(db, statements);
	return { success: true, id: questionId };
}

export async function updateMcq(
	db: D1Database,
	input: UpdateMcqInput,
): Promise<UpdateMcqResult> {
	if (!validatePrompt(input.prompt)) {
		return { success: false, error: "INVALID_PROMPT" };
	}
	const v = validateOptions(input.options);
	if (!v.ok) return { success: false, error: v.error };

	const row = await executeQueryFirst<Pick<QuestionRow, "author_user_id">>(
		db,
		`SELECT author_user_id FROM mcq_questions WHERE id = ?`,
		[input.id],
	);
	if (!row) return { success: false, error: "NOT_FOUND" };
	if (row.author_user_id !== input.authorUserId) {
		return { success: false, error: "FORBIDDEN" };
	}

	const actor = input.actorUserId ?? input.authorUserId;
	const now = new Date().toISOString();

	const statements: { sql: string; params?: unknown[] }[] = [
		{
			sql: `UPDATE mcq_questions
          SET prompt = ?, updated_at = ?, updated_by = ?
          WHERE id = ? AND author_user_id = ?`,
			params: [
				input.prompt.trim(),
				now,
				actor,
				input.id,
				input.authorUserId,
			],
		},
		{
			sql: `DELETE FROM mcq_options WHERE question_id = ?`,
			params: [input.id],
		},
	];

	let oi = 0;
	for (const o of input.options) {
		const optionId = generateId();
		statements.push({
			sql: `INSERT INTO mcq_options (
            id, question_id, label, body, is_correct, sort_order,
            created_at, updated_at, created_by, updated_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			params: [
				optionId,
				input.id,
				null,
				o.body.trim(),
				o.isCorrect ? 1 : 0,
				oi++,
				now,
				now,
				actor,
				actor,
			],
		});
	}

	await executeBatch(db, statements);
	return { success: true };
}

export async function deleteMcq(
	db: D1Database,
	args: { id: string; authorUserId: string },
): Promise<DeleteMcqResult> {
	const row = await executeQueryFirst<Pick<QuestionRow, "author_user_id">>(
		db,
		`SELECT author_user_id FROM mcq_questions WHERE id = ?`,
		[args.id],
	);
	if (!row) return { success: false, error: "NOT_FOUND" };
	if (row.author_user_id !== args.authorUserId) {
		return { success: false, error: "FORBIDDEN" };
	}

	await executeMutation(db, `DELETE FROM mcq_questions WHERE id = ?`, [
		args.id,
	]);
	return { success: true };
}
