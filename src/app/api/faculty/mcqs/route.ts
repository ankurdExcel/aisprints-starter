import { NextResponse } from "next/server";

import { formatZodError } from "@/lib/auth/auth-schemas";
import { requireFacultyRequest } from "@/lib/auth/faculty-api-session";
import { listMcqsQuerySchema, mcqWriteBodySchema } from "@/lib/faculty/mcq-api-schemas";
import {
	createMcq,
	listMcqsForAuthor,
} from "@/lib/services/mcq-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const session = await requireFacultyRequest(request);
	if (!session.ok) return session.response;

	const url = new URL(request.url);
	const raw = Object.fromEntries(url.searchParams.entries());
	const parsed = listMcqsQuerySchema.safeParse(raw);
	if (!parsed.success) {
		return NextResponse.json(formatZodError(parsed.error), { status: 400 });
	}

	const q = parsed.data.q?.trim() || undefined;
	const result = await listMcqsForAuthor(session.db, {
		authorUserId: session.facultyUserId,
		page: parsed.data.page,
		pageSize: parsed.data.pageSize,
		sort: parsed.data.sort,
		q,
	});

	return NextResponse.json(result);
}

export async function POST(request: Request) {
	const session = await requireFacultyRequest(request);
	if (!session.ok) return session.response;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = mcqWriteBodySchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(formatZodError(parsed.error), { status: 400 });
	}

	const result = await createMcq(session.db, {
		authorUserId: session.facultyUserId,
		actorUserId: session.facultyUserId,
		prompt: parsed.data.prompt,
		options: parsed.data.options.map((o) => ({
			body: o.body,
			isCorrect: o.isCorrect,
		})),
	});

	if (!result.success) {
		const message =
			result.error === "INVALID_PROMPT"
				? "Question text is invalid"
				: "Options are invalid";
		return NextResponse.json({ message }, { status: 400 });
	}

	return NextResponse.json({ id: result.id }, { status: 201 });
}
