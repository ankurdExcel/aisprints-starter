import { NextResponse } from "next/server";

import { buildClearSessionCookieHeader } from "@/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

export async function POST() {
	const res = NextResponse.json({ ok: true }, { status: 200 });
	res.headers.append("Set-Cookie", buildClearSessionCookieHeader());
	return res;
}
