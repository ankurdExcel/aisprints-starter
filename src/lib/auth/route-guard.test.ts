import { describe, expect, it } from "vitest";

import {
	requiredRoleForPathname,
	resolvePostAuthRedirect,
	sanitizeReturnUrl,
} from "@/lib/auth/route-guard";

describe("requiredRoleForPathname", () => {
	it("maps /faculty and nested paths to faculty", () => {
		expect(requiredRoleForPathname("/faculty")).toBe("faculty");
		expect(requiredRoleForPathname("/faculty/")).toBe("faculty");
		expect(requiredRoleForPathname("/faculty/quizzes")).toBe("faculty");
	});

	it("maps /student and nested paths to student", () => {
		expect(requiredRoleForPathname("/student")).toBe("student");
		expect(requiredRoleForPathname("/student/attempts")).toBe("student");
	});

	it("returns null for unrelated paths", () => {
		expect(requiredRoleForPathname("/")).toBeNull();
		expect(requiredRoleForPathname("/login")).toBeNull();
		expect(requiredRoleForPathname("/api/auth/me")).toBeNull();
	});
});

describe("sanitizeReturnUrl", () => {
	it("accepts same-origin path and query", () => {
		expect(sanitizeReturnUrl("/faculty?q=1")).toBe("/faculty?q=1");
		expect(sanitizeReturnUrl("%2Ffaculty%3Fq%3D1")).toBe("/faculty?q=1");
	});

	it("rejects open redirects and schemes", () => {
		expect(sanitizeReturnUrl("//evil.com")).toBeNull();
		expect(sanitizeReturnUrl("https://evil.com")).toBeNull();
		expect(sanitizeReturnUrl("/path\\backslash")).toBeNull();
	});

	it("rejects auth and API targets", () => {
		expect(sanitizeReturnUrl("/login")).toBeNull();
		expect(sanitizeReturnUrl("/signup?x=1")).toBeNull();
		expect(sanitizeReturnUrl("/api/auth/me")).toBeNull();
	});

	it("rejects traversal and control chars", () => {
		expect(sanitizeReturnUrl("/faculty/../student")).toBeNull();
		expect(sanitizeReturnUrl("/faculty%00")).toBeNull();
	});
});

describe("resolvePostAuthRedirect", () => {
	it("uses returnUrl when role matches protected tree", () => {
		expect(
			resolvePostAuthRedirect("faculty", "/faculty/courses?tab=draft"),
		).toBe("/faculty/courses?tab=draft");
		expect(resolvePostAuthRedirect("student", "/student")).toBe("/student");
	});

	it("falls back to dashboard when returnUrl targets other role area", () => {
		expect(resolvePostAuthRedirect("faculty", "/student")).toBe("/faculty");
		expect(resolvePostAuthRedirect("student", "/faculty")).toBe("/student");
	});

	it("falls back when returnUrl is missing, unsafe, or not role-guarded", () => {
		expect(resolvePostAuthRedirect("faculty", null)).toBe("/faculty");
		expect(resolvePostAuthRedirect("student", "//x")).toBe("/student");
		expect(resolvePostAuthRedirect("faculty", "/")).toBe("/faculty");
	});
});
