/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	replace: vi.fn(),
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({
		replace: mocks.replace,
		push: vi.fn(),
		prefetch: vi.fn(),
	}),
}));

vi.mock("sonner", () => ({
	toast: {
		error: mocks.toastError,
		success: mocks.toastSuccess,
	},
}));

vi.mock("next/link", () => ({
	default: ({ children, href }: { children: ReactNode; href: string }) =>
		createElement("a", { href }, children),
}));

const fetchMock = vi.fn();

describe("LoginPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockImplementation((input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/auth/me")) {
				return Promise.resolve(new Response(null, { status: 401 }));
			}
			return Promise.resolve(
				new Response(JSON.stringify({ message: "unexpected" }), { status: 500 }),
			);
		});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("redirects faculty to /faculty after successful login", async () => {
		fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/auth/me")) {
				return Promise.resolve(new Response(null, { status: 401 }));
			}
			if (url.includes("/api/auth/login") && init?.method === "POST") {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							user: {
								id: "u1",
								email: "a@b.com",
								firstName: "A",
								lastName: "B",
								role: "faculty",
								createdAt: "",
								updatedAt: "",
							},
						}),
						{ status: 200 },
					),
				);
			}
			return Promise.resolve(new Response(null, { status: 500 }));
		});

		const { default: LoginPage } = await import("./page");
		render(createElement(LoginPage));
		const user = userEvent.setup();

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/auth/me",
				expect.objectContaining({ credentials: "include" }),
			);
		});

		await user.type(screen.getByLabelText(/email/i), "teacher@school.edu");
		await user.type(screen.getByLabelText(/^password$/i), "password123");
		await user.click(screen.getByRole("button", { name: /log in/i }));

		await waitFor(() => {
			expect(mocks.replace).toHaveBeenCalledWith("/faculty");
			expect(mocks.toastSuccess).toHaveBeenCalled();
		});
	});

	it("shows toast on invalid credentials", async () => {
		fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/auth/me")) {
				return Promise.resolve(new Response(null, { status: 401 }));
			}
			if (url.includes("/api/auth/login") && init?.method === "POST") {
				return Promise.resolve(
					new Response(JSON.stringify({ message: "Invalid email or password" }), {
						status: 401,
					}),
				);
			}
			return Promise.resolve(new Response(null, { status: 500 }));
		});

		const { default: LoginPage } = await import("./page");
		render(createElement(LoginPage));
		const user = userEvent.setup();

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());

		await user.type(screen.getByLabelText(/email/i), "x@y.com");
		await user.type(screen.getByLabelText(/^password$/i), "wrong");
		await user.click(screen.getByRole("button", { name: /log in/i }));

		await waitFor(() => {
			expect(mocks.toastError).toHaveBeenCalledWith("Invalid email or password");
			expect(mocks.replace).not.toHaveBeenCalled();
		});
	});
});
