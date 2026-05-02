/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	replace: vi.fn(),
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
	searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({
		replace: mocks.replace,
		push: vi.fn(),
		prefetch: vi.fn(),
	}),
	useSearchParams: () => mocks.searchParams,
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

describe("SignupPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.searchParams = new URLSearchParams();
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

	it("redirects student to /student after successful signup", async () => {
		fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/auth/me")) {
				return Promise.resolve(new Response(null, { status: 401 }));
			}
			if (url.includes("/api/auth/signup") && init?.method === "POST") {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							user: {
								id: "u2",
								email: "stu@school.edu",
								firstName: "S",
								lastName: "T",
								role: "student",
								createdAt: "",
								updatedAt: "",
							},
						}),
						{ status: 201 },
					),
				);
			}
			return Promise.resolve(new Response(null, { status: 500 }));
		});

		const { default: SignupPage } = await import("./page");
		render(createElement(SignupPage));
		const user = userEvent.setup();

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());

		await user.type(screen.getByLabelText(/first name/i), "Sam");
		await user.type(screen.getByLabelText(/last name/i), "Student");
		await user.type(screen.getByLabelText(/^email$/i), "stu@school.edu");
		await user.type(screen.getByLabelText(/^password$/i), "password12");
		await user.type(screen.getByLabelText(/confirm password/i), "password12");
		await user.click(screen.getByRole("radio", { name: /student/i }));
		await user.click(screen.getByRole("button", { name: /sign up/i }));

		await waitFor(() => {
			expect(mocks.replace).toHaveBeenCalledWith("/student");
			expect(mocks.toastSuccess).toHaveBeenCalled();
		});

		const signupCall = fetchMock.mock.calls.find(
			([url, init]) =>
				String(url).includes("/api/auth/signup") &&
				(init as RequestInit)?.method === "POST",
		);
		expect(signupCall).toBeDefined();
		const body = JSON.parse((signupCall![1] as RequestInit).body as string);
		expect(body).not.toHaveProperty("confirmPassword");
		expect(body.role).toBe("student");
	});

	it("does not submit when passwords do not match", async () => {
		const { default: SignupPage } = await import("./page");
		render(createElement(SignupPage));
		const user = userEvent.setup();

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());

		await user.type(screen.getByLabelText(/first name/i), "A");
		await user.type(screen.getByLabelText(/last name/i), "B");
		await user.type(screen.getByLabelText(/^email$/i), "a@b.com");
		await user.type(screen.getByLabelText(/^password$/i), "password12");
		await user.type(screen.getByLabelText(/confirm password/i), "password99");
		await user.click(screen.getByRole("button", { name: /sign up/i }));

		await waitFor(() => {
			expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
		});
		const signupPosts = fetchMock.mock.calls.filter(
			([url, init]) =>
				String(url).includes("/api/auth/signup") &&
				(init as RequestInit | undefined)?.method === "POST",
		);
		expect(signupPosts.length).toBe(0);
	});
});
