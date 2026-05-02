/**
 * Central D1 access: normalize anonymous `?` placeholders to `?1`, `?2`, …
 * before binding, then run queries via {@link D1PreparedStatement.all} / {@link D1PreparedStatement.run}.
 *
 * @see docs/PRD_AUTHENTICATION.md Phase 2
 */

/** Max explicit `?N` index found outside of string literals (first pass). */
function scanMaxExplicitPlaceholderIndex(sql: string): number {
	let max = 0;
	let inSingleQuote = false;
	let i = 0;
	while (i < sql.length) {
		const ch = sql[i]!;
		if (inSingleQuote) {
			if (ch === "'") {
				if (sql[i + 1] === "'") {
					i += 2;
					continue;
				}
				inSingleQuote = false;
			}
			i++;
			continue;
		}
		if (ch === "'") {
			inSingleQuote = true;
			i++;
			continue;
		}
		if (ch === "?") {
			let j = i + 1;
			let numStr = "";
			while (j < sql.length) {
				const c = sql[j]!;
				if (c < "0" || c > "9") break;
				numStr += c;
				j++;
			}
			if (numStr.length > 0) {
				max = Math.max(max, Number.parseInt(numStr, 10));
				i = j;
				continue;
			}
		}
		i++;
	}
	return max;
}

export type NormalizeSqlResult = {
	normalizedSql: string;
	/** Number of bind slots after normalization (largest `?n` index used). */
	bindSlotCount: number;
};

/**
 * Rewrites anonymous `?` placeholders to positional `?n`, skipping `?` inside single-quoted strings.
 * Existing `?123` tokens are preserved. Anonymous indices start at `max(explicit) + 1`.
 */
export function normalizeSql(sql: string): NormalizeSqlResult {
	const maxExplicit = scanMaxExplicitPlaceholderIndex(sql);
	let nextAnonymous = maxExplicit + 1;
	let out = "";
	let inSingleQuote = false;
	let i = 0;
	while (i < sql.length) {
		const ch = sql[i]!;
		if (inSingleQuote) {
			if (ch === "'") {
				if (sql[i + 1] === "'") {
					out += "''";
					i += 2;
					continue;
				}
				inSingleQuote = false;
			}
			out += ch;
			i++;
			continue;
		}
		if (ch === "'") {
			inSingleQuote = true;
			out += ch;
			i++;
			continue;
		}
		if (ch === "?") {
			let j = i + 1;
			let numStr = "";
			while (j < sql.length) {
				const c = sql[j]!;
				if (c < "0" || c > "9") break;
				numStr += c;
				j++;
			}
			if (numStr.length > 0) {
				out += sql.slice(i, j);
				i = j;
				continue;
			}
			out += `?${nextAnonymous++}`;
			i++;
			continue;
		}
		out += ch;
		i++;
	}
	const bindSlotCount = nextAnonymous - 1;
	return { normalizedSql: out, bindSlotCount };
}

function assertBindCount(
	expected: number,
	actual: number,
	context: string,
): void {
	if (expected !== actual) {
		throw new Error(
			`[d1-client:${context}] Expected ${expected} bind parameter(s), got ${actual}`,
		);
	}
}

export async function executeQuery<T = Record<string, unknown>>(
	db: D1Database,
	sql: string,
	params: unknown[] = [],
): Promise<T[]> {
	const { normalizedSql, bindSlotCount } = normalizeSql(sql);
	assertBindCount(bindSlotCount, params.length, "executeQuery");
	const stmt = db.prepare(normalizedSql);
	const bound = params.length > 0 ? stmt.bind(...params) : stmt;
	const { results } = await bound.all<T>();
	return results ?? [];
}

/**
 * Single-row reads use `all()` and the first row — avoids `stmt.first()` quirks in local dev.
 */
export async function executeQueryFirst<T = Record<string, unknown>>(
	db: D1Database,
	sql: string,
	params: unknown[] = [],
): Promise<T | null> {
	const rows = await executeQuery<T>(db, sql, params);
	return rows[0] ?? null;
}

export async function executeMutation(
	db: D1Database,
	sql: string,
	params: unknown[] = [],
): Promise<D1Result<Record<string, unknown>>> {
	const { normalizedSql, bindSlotCount } = normalizeSql(sql);
	assertBindCount(bindSlotCount, params.length, "executeMutation");
	const stmt = db.prepare(normalizedSql);
	const bound = params.length > 0 ? stmt.bind(...params) : stmt;
	return bound.run();
}

export type BatchStatement = {
	sql: string;
	params?: unknown[];
};

export async function executeBatch(
	db: D1Database,
	statements: BatchStatement[],
): Promise<D1Result<Record<string, unknown>>[]> {
	const prepared: D1PreparedStatement[] = statements.map(
		({ sql, params = [] }, index) => {
			const { normalizedSql, bindSlotCount } = normalizeSql(sql);
			assertBindCount(
				bindSlotCount,
				params.length,
				`executeBatch[${index}]`,
			);
			const stmt = db.prepare(normalizedSql);
			return params.length > 0 ? stmt.bind(...params) : stmt;
		},
	);
	return db.batch(prepared);
}

/** 16-byte random id as 32 lowercase hex chars (matches SQL `lower(hex(randomblob(16)))`). */
export function generateId(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getDatabase(env: Cloudflare.Env): D1Database {
	return env.tna_app_db;
}
