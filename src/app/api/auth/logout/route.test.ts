import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/auth/logout", () => {
	it("returns ok and clear-cookie header", async () => {
		const res = await POST();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
		const sc = res.headers.get("set-cookie");
		expect(sc).toContain("qm_session=");
		expect(sc).toContain("Max-Age=0");
	});
});
