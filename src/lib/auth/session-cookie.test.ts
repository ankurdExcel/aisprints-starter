import { describe, expect, it, vi } from "vitest";
import {
	buildClearSessionCookieHeader,
	buildSetSessionCookieHeader,
	parseCookieValue,
} from "./session-cookie";
import { SESSION_COOKIE_NAME } from "./session-constants";

describe("session-cookie", () => {
	it("parseCookieValue reads encoded value", () => {
		const raw = `other=1; ${SESSION_COOKIE_NAME}=${encodeURIComponent("a.b~c")}; x=y`;
		expect(parseCookieValue(raw, SESSION_COOKIE_NAME)).toBe("a.b~c");
	});

	it("parseCookieValue returns null when missing", () => {
		expect(parseCookieValue("foo=bar", SESSION_COOKIE_NAME)).toBeNull();
		expect(parseCookieValue(null, SESSION_COOKIE_NAME)).toBeNull();
	});

	it("buildSetSessionCookieHeader includes HttpOnly and SameSite=Lax", () => {
		vi.stubEnv("NODE_ENV", "development");
		const h = buildSetSessionCookieHeader("tok.en");
		expect(h).toContain(`${SESSION_COOKIE_NAME}=`);
		expect(h).toContain("HttpOnly");
		expect(h).toContain("SameSite=Lax");
		expect(h).toContain("Path=/");
		expect(h).toContain("Max-Age=");
		expect(h).not.toContain("Secure");
		vi.unstubAllEnvs();
	});

	it("buildSetSessionCookieHeader adds Secure in production", () => {
		vi.stubEnv("NODE_ENV", "production");
		const h = buildSetSessionCookieHeader("abc");
		expect(h).toContain("Secure");
		vi.unstubAllEnvs();
	});

	it("buildClearSessionCookieHeader clears cookie", () => {
		vi.stubEnv("NODE_ENV", "development");
		const h = buildClearSessionCookieHeader();
		expect(h).toContain("Max-Age=0");
		expect(h).toContain(`${SESSION_COOKIE_NAME}=`);
		vi.unstubAllEnvs();
	});
});
