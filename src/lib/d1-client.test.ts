import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	executeBatch,
	executeMutation,
	executeQuery,
	executeQueryFirst,
	generateId,
	getDatabase,
	normalizeSql,
} from "./d1-client";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("normalizeSql", () => {
	it("maps anonymous placeholders to ?1 ?2 in order", () => {
		const { normalizedSql, bindSlotCount } = normalizeSql(
			"SELECT * FROM users WHERE a = ? AND b = ?",
		);
		expect(normalizedSql).toBe(
			"SELECT * FROM users WHERE a = ?1 AND b = ?2",
		);
		expect(bindSlotCount).toBe(2);
	});

	it("does not rewrite ? inside single-quoted strings", () => {
		const { normalizedSql, bindSlotCount } = normalizeSql(
			"SELECT 'a?b' AS lit WHERE id = ?",
		);
		expect(normalizedSql).toBe("SELECT 'a?b' AS lit WHERE id = ?1");
		expect(bindSlotCount).toBe(1);
	});

	it("handles escaped single quote inside string", () => {
		const { normalizedSql, bindSlotCount } = normalizeSql(
			"SELECT 'it''s' AS s WHERE x = ?",
		);
		expect(normalizedSql).toContain("WHERE x = ?1");
		expect(bindSlotCount).toBe(1);
	});

	it("preserves explicit ?n and assigns anonymous after max explicit", () => {
		const { normalizedSql, bindSlotCount } = normalizeSql(
			"SELECT * FROM t WHERE a = ?1 AND b = ?",
		);
		expect(normalizedSql).toBe(
			"SELECT * FROM t WHERE a = ?1 AND b = ?2",
		);
		expect(bindSlotCount).toBe(2);
	});

	it("returns zero bind slots when there are no placeholders", () => {
		const { normalizedSql, bindSlotCount } = normalizeSql(
			"SELECT 1 AS one",
		);
		expect(normalizedSql).toBe("SELECT 1 AS one");
		expect(bindSlotCount).toBe(0);
	});
});

describe("executeQuery", () => {
	it("prepares normalized SQL and binds parameters", async () => {
		const prepare = vi.fn((sql: string) => ({
			bind: vi.fn(() => ({
				all: vi.fn(async () => ({
					results: [{ id: "x" }],
					success: true,
					meta: {},
				})),
			})),
			_preparedSql: sql,
		}));
		const db = { prepare, batch: vi.fn() } as unknown as D1Database;

		const rows = await executeQuery(db, "SELECT * FROM users WHERE id = ?", [
			"u1",
		]);
		expect(prepare).toHaveBeenCalledWith("SELECT * FROM users WHERE id = ?1");
		expect(rows).toEqual([{ id: "x" }]);
	});

	it("throws when parameter count does not match placeholders", async () => {
		const db = { prepare: vi.fn(), batch: vi.fn() } as unknown as D1Database;
		await expect(
			executeQuery(db, "SELECT * WHERE a = ? AND b = ?", ["only"]),
		).rejects.toThrow(/Expected 2 bind parameter/);
	});

	it("allows empty params when there are no placeholders", async () => {
		const all = vi.fn(async () => ({
			results: [{ one: 1 }],
			success: true,
			meta: {},
		}));
		const bind = vi.fn();
		const prepare = vi.fn(() => ({ bind, all }));
		const db = { prepare, batch: vi.fn() } as unknown as D1Database;

		const rows = await executeQuery(db, "SELECT 1 AS one", []);
		expect(bind).not.toHaveBeenCalled();
		expect(all).toHaveBeenCalled();
		expect(rows).toEqual([{ one: 1 }]);
	});
});

describe("executeQueryFirst", () => {
	it("returns first row from all()", async () => {
		const all = vi.fn(async () => ({
			results: [{ id: "1" }, { id: "2" }],
			success: true,
			meta: {},
		}));
		const prepare = vi.fn(() => ({
			bind: vi.fn(() => ({ all })),
			all,
		}));
		const db = { prepare, batch: vi.fn() } as unknown as D1Database;

		const row = await executeQueryFirst(db, "SELECT id FROM t WHERE x = ?", [
			1,
		]);
		expect(row).toEqual({ id: "1" });
	});

	it("returns null when no rows", async () => {
		const all = vi.fn(async () => ({
			results: [],
			success: true,
			meta: {},
		}));
		const prepare = vi.fn(() => ({ bind: vi.fn(), all }));
		const db = { prepare, batch: vi.fn() } as unknown as D1Database;

		const row = await executeQueryFirst(db, "SELECT id FROM t WHERE 0", []);
		expect(row).toBeNull();
	});
});

describe("executeMutation", () => {
	it("uses run() with normalized SQL and binds", async () => {
		const run = vi.fn(async () => ({
			success: true,
			meta: { changes: 1 },
			results: [],
		}));
		const prepare = vi.fn(() => ({
			bind: vi.fn(() => ({ run })),
			run,
		}));
		const db = { prepare, batch: vi.fn() } as unknown as D1Database;

		const result = await executeMutation(
			db,
			"UPDATE users SET name = ? WHERE id = ?",
			["Ada", "id-1"],
		);
		expect(prepare).toHaveBeenCalledWith(
			"UPDATE users SET name = ?1 WHERE id = ?2",
		);
		expect(run).toHaveBeenCalled();
		expect(result.success).toBe(true);
	});
});

describe("executeBatch", () => {
	it("passes one prepared statement per entry to db.batch", async () => {
		const batch = vi.fn(
			async () =>
				[
					{ success: true, meta: {}, results: [] },
				] as D1Result<Record<string, unknown>>[],
		);
		const prepare = vi.fn((sql: string) => ({
			bind: vi.fn((...p: unknown[]) => ({ sql, p })),
			all: vi.fn(),
			run: vi.fn(),
		}));
		const db = { prepare, batch } as unknown as D1Database;

		await executeBatch(db, [
			{ sql: "INSERT INTO t (a) VALUES (?)", params: [1] },
			{ sql: "SELECT 1", params: [] },
		]);

		expect(batch).toHaveBeenCalledTimes(1);
		const stmts = batch.mock.calls[0]![0] as unknown[];
		expect(stmts).toHaveLength(2);
		expect(prepare).toHaveBeenNthCalledWith(
			1,
			"INSERT INTO t (a) VALUES (?1)",
		);
		expect(prepare).toHaveBeenNthCalledWith(2, "SELECT 1");
	});
});

describe("generateId", () => {
	it("returns 32 lowercase hex characters", () => {
		const id = generateId();
		expect(id).toMatch(/^[0-9a-f]{32}$/);
	});
});

describe("getDatabase", () => {
	it("returns tna_app_db from env", () => {
		const fake = {} as D1Database;
		const env = { tna_app_db: fake } as Cloudflare.Env;
		expect(getDatabase(env)).toBe(fake);
	});
});
