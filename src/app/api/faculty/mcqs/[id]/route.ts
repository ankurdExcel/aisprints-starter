import { NextResponse } from "next/server";

import { formatZodError } from "@/lib/auth/auth-schemas";
import { requireFacultyRequest } from "@/lib/auth/faculty-api-session";
import { mcqWriteBodySchema } from "@/lib/faculty/mcq-api-schemas";
import {
	deleteMcq,
	getMcqByIdForAuthor,
	updateMcq,
} from "@/lib/services/mcq-service";

export const dynamic = "force-dynamic";

function notFoundResponse() {
	return NextResponse.json({ message: "Not found" }, { status: 404 });
}

export async function GET(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const session = await requireFacultyRequest(request);
	if (!session.ok) return session.response;

	const { id } = await context.params;
	const result = await getMcqByIdForAuthor(session.db, {
		id,
		authorUserId: session.facultyUserId,
	});

	if (!result.success) {
		return notFoundResponse();
	}

	return NextResponse.json({ mcq: result.mcq });
}

export async function PATCH(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const session = await requireFacultyRequest(request);
	if (!session.ok) return session.response;

	const { id } = await context.params;

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

	const result = await updateMcq(session.db, {
		id,
		authorUserId: session.facultyUserId,
		actorUserId: session.facultyUserId,
		prompt: parsed.data.prompt,
		options: parsed.data.options.map((o) => ({
			body: o.body,
			isCorrect: o.isCorrect,
		})),
	});

	if (!result.success) {
		if (result.error === "NOT_FOUND" || result.error === "FORBIDDEN") {
			return notFoundResponse();
		}
		const message =
			result.error === "INVALID_PROMPT"
				? "Question text is invalid"
				: "Options are invalid";
		return NextResponse.json({ message }, { status: 400 });
	}

	return NextResponse.json({ ok: true });
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const session = await requireFacultyRequest(request);
	if (!session.ok) return session.response;

	const { id } = await context.params;
	const result = await deleteMcq(session.db, {
		id,
		authorUserId: session.facultyUserId,
	});

	if (!result.success) {
		return notFoundResponse();
	}

	return new NextResponse(null, { status: 204 });
}
