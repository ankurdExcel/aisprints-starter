"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type LoginFormValues, loginFormSchema } from "@/lib/auth/client-schemas";
import { resolvePostAuthRedirect } from "@/lib/auth/route-guard";
import type { UserRole } from "@/lib/auth/roles";

const FORM_ID = "login-form";

function authHref(base: "/login" | "/signup", returnUrl: string | null): string {
	if (!returnUrl) return base;
	return `${base}?returnUrl=${encodeURIComponent(returnUrl)}`;
}

async function readErrorMessage(res: Response): Promise<string> {
	try {
		const data: unknown = await res.json();
		if (
			data &&
			typeof data === "object" &&
			"message" in data &&
			typeof (data as { message: unknown }).message === "string"
		) {
			return (data as { message: string }).message;
		}
	} catch {
		/* ignore */
	}
	return "Something went wrong";
}

function LoginCardFallback() {
	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>Log in</CardTitle>
				<CardDescription>Use the email and password for your account.</CardDescription>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground">Loading…</p>
			</CardContent>
		</Card>
	);
}

function LoginPageInner() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const returnUrl = searchParams.get("returnUrl");

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const res = await fetch("/api/auth/me", { credentials: "include" });
			if (cancelled || !res.ok) return;
			const data: unknown = await res.json();
			const role = (data as { user?: { role?: UserRole } }).user?.role;
			if (role === "faculty" || role === "student") {
				router.replace(resolvePostAuthRedirect(role, returnUrl));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [router, returnUrl]);

	const form = useForm<LoginFormValues>({
		resolver: zodResolver(loginFormSchema),
		defaultValues: {
			email: "",
			password: "",
		},
	});

	const onSubmit = form.handleSubmit(async (values) => {
		const res = await fetch("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify(values),
		});

		if (!res.ok) {
			const message = await readErrorMessage(res);
			toast.error(message);
			return;
		}

		const data: unknown = await res.json();
		const role = (data as { user?: { role?: UserRole } }).user?.role;
		if (role === "faculty" || role === "student") {
			toast.success("Signed in");
			router.replace(resolvePostAuthRedirect(role, returnUrl));
			return;
		}
		toast.error("Unexpected response");
	});

	const signupHref = authHref("/signup", returnUrl);

	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>Log in</CardTitle>
				<CardDescription>Use the email and password for your account.</CardDescription>
			</CardHeader>
			<CardContent>
				<form id={FORM_ID} onSubmit={onSubmit}>
					<FieldGroup className="gap-5">
						<Controller
							name="email"
							control={form.control}
							render={({ field, fieldState }) => (
								<Field data-invalid={fieldState.invalid ? "true" : undefined}>
									<FieldLabel htmlFor="login-email">Email</FieldLabel>
									<Input
										{...field}
										id="login-email"
										type="email"
										autoComplete="email"
										aria-invalid={fieldState.invalid}
									/>
									{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
								</Field>
							)}
						/>
						<Controller
							name="password"
							control={form.control}
							render={({ field, fieldState }) => (
								<Field data-invalid={fieldState.invalid ? "true" : undefined}>
									<FieldLabel htmlFor="login-password">Password</FieldLabel>
									<Input
										{...field}
										id="login-password"
										type="password"
										autoComplete="current-password"
										aria-invalid={fieldState.invalid}
									/>
									{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
								</Field>
							)}
						/>
					</FieldGroup>
				</form>
			</CardContent>
			<CardFooter className="flex flex-col gap-3 sm:flex-row sm:justify-end">
				<Button type="submit" form={FORM_ID} disabled={form.formState.isSubmitting}>
					{form.formState.isSubmitting ? "Signing in…" : "Log in"}
				</Button>
				<p className="text-center text-sm text-muted-foreground sm:mr-auto sm:text-left">
					New here?{" "}
					<Link
						href={signupHref}
						className="font-medium text-primary underline-offset-4 hover:underline"
					>
						Create an account
					</Link>
				</p>
			</CardFooter>
		</Card>
	);
}

export default function LoginPage() {
	return (
		<Suspense fallback={<LoginCardFallback />}>
			<LoginPageInner />
		</Suspense>
	);
}
