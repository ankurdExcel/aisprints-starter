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
});
