/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	replace: vi.fn(),
	searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({
		replace: mocks.replace,
		push: vi.fn(),
		prefetch: vi.fn(),
	}),
	useSearchParams: () => mocks.searchParams,
	usePathname: () => "/faculty",
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

import FacultyMcqListPage from "./page";
import { professorMcq } from "@/lib/copy/professor";

const fetchMock = vi.fn();

describe("FacultyMcqListPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.searchParams = new URLSearchParams();
		vi.stubGlobal("fetch", fetchMock);
		fetchMock.mockImplementation(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({ items: [], total: 0, page: 1, pageSize: 15 }),
					{ status: 200 },
				),
			),
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("shows professor empty state when there are no MCQs", async () => {
		render(createElement(FacultyMcqListPage));
		await waitFor(() => {
			expect(screen.getByText(professorMcq.emptyTitle)).toBeInTheDocument();
		});
		expect(screen.getByText(professorMcq.emptyDescription)).toBeInTheDocument();
	});

	it("opens add MCQ dialog when Add MCQ is clicked", async () => {
		const user = userEvent.setup();
		render(createElement(FacultyMcqListPage));
		await waitFor(() => {
			expect(screen.getByText(professorMcq.emptyTitle)).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: /^Add MCQ$/i }));
		const dialog = await screen.findByRole("dialog");
		expect(dialog).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: /^Add MCQ$/i, hidden: true }),
		).toBeInTheDocument();
	});

	it("preview: select answer then submit shows correct feedback", async () => {
		const user = userEvent.setup();
		fetchMock.mockImplementation((input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/faculty/mcqs/q1")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							mcq: {
								id: "q1",
								prompt: "Capital of France?",
								authorUserId: "u1",
								createdAt: "c",
								updatedAt: "u",
								options: [
									{
										id: "o1",
										label: null,
										body: "Paris",
										isCorrect: true,
										sortOrder: 0,
									},
									{
										id: "o2",
										label: null,
										body: "London",
										isCorrect: false,
										sortOrder: 1,
									},
								],
							},
						}),
						{ status: 200 },
					),
				);
			}
			if (url.includes("/api/faculty/mcqs")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							items: [
								{
									id: "q1",
									prompt: "Capital of France?",
									optionCount: 2,
									updatedAt: "2026-01-01T00:00:00.000Z",
								},
							],
							total: 1,
							page: 1,
							pageSize: 15,
						}),
						{ status: 200 },
					),
				);
			}
			return Promise.resolve(new Response("{}", { status: 404 }));
		});

		render(createElement(FacultyMcqListPage));
		await waitFor(() => {
			expect(screen.getByText("Capital of France?")).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /^Preview$/i }));

		await waitFor(() => {
			expect(
				screen.getByText(professorMcq.previewAttemptDescription),
			).toBeInTheDocument();
		});

		await user.click(screen.getByRole("radio", { name: /Paris/i }));
		await user.click(
			screen.getByRole("button", { name: professorMcq.previewSubmitAnswer }),
		);

		await waitFor(() => {
			expect(
				screen.getByText(professorMcq.previewResultHeadlineCorrect),
			).toBeInTheDocument();
		});
	});

	it("preview: select wrong answer then submit shows incorrect feedback", async () => {
		const user = userEvent.setup();
		fetchMock.mockImplementation((input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/api/faculty/mcqs/q1")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							mcq: {
								id: "q1",
								prompt: "Capital of France?",
								authorUserId: "u1",
								createdAt: "c",
								updatedAt: "u",
								options: [
									{
										id: "o1",
										label: null,
										body: "Paris",
										isCorrect: true,
										sortOrder: 0,
									},
									{
										id: "o2",
										label: null,
										body: "London",
										isCorrect: false,
										sortOrder: 1,
									},
								],
							},
						}),
						{ status: 200 },
					),
				);
			}
			if (url.includes("/api/faculty/mcqs")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							items: [
								{
									id: "q1",
									prompt: "Capital of France?",
									optionCount: 2,
									updatedAt: "2026-01-01T00:00:00.000Z",
								},
							],
							total: 1,
							page: 1,
							pageSize: 15,
						}),
						{ status: 200 },
					),
				);
			}
			return Promise.resolve(new Response("{}", { status: 404 }));
		});

		render(createElement(FacultyMcqListPage));
		await waitFor(() => {
			expect(screen.getByText("Capital of France?")).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /^Preview$/i }));

		await waitFor(() => {
			expect(
				screen.getByText(professorMcq.previewAttemptDescription),
			).toBeInTheDocument();
		});

		await user.click(screen.getByRole("radio", { name: /London/i }));
		await user.click(
			screen.getByRole("button", { name: professorMcq.previewSubmitAnswer }),
		);

		await waitFor(() => {
			expect(
				screen.getByText(professorMcq.previewResultHeadlineIncorrect),
			).toBeInTheDocument();
		});
	});
});
