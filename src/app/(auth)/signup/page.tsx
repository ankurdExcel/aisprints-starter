"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
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
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldSet,
	FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	type SignupFormValues,
	signupFormSchema,
} from "@/lib/auth/client-schemas";
import { dashboardPathForRole } from "@/lib/auth/dashboard-path";
import type { UserRole } from "@/lib/auth/roles";

const FORM_ID = "signup-form";

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

export default function SignupPage() {
	const router = useRouter();

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const res = await fetch("/api/auth/me", { credentials: "include" });
			if (cancelled || !res.ok) return;
			const data: unknown = await res.json();
			const role = (data as { user?: { role?: UserRole } }).user?.role;
			if (role === "faculty" || role === "student") {
				router.replace(dashboardPathForRole(role));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [router]);

	const form = useForm<SignupFormValues>({
		resolver: zodResolver(signupFormSchema),
		defaultValues: {
			firstName: "",
			lastName: "",
			email: "",
			password: "",
			confirmPassword: "",
			role: "student",
		},
	});

	const onSubmit = form.handleSubmit(async (values) => {
		const { confirmPassword, ...body } = values;
		void confirmPassword;
		const res = await fetch("/api/auth/signup", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const message = await readErrorMessage(res);
			toast.error(message);
			return;
		}

		const data: unknown = await res.json();
		const role = (data as { user?: { role?: UserRole } }).user?.role;
		if (role === "faculty" || role === "student") {
			toast.success("Account created");
			router.replace(dashboardPathForRole(role));
			return;
		}
		toast.error("Unexpected response");
	});

	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>Create account</CardTitle>
				<CardDescription>Sign up as faculty or student.</CardDescription>
			</CardHeader>
			<CardContent>
				<form id={FORM_ID} onSubmit={onSubmit}>
					<FieldSet className="gap-6" disabled={form.formState.isSubmitting}>
						<FieldGroup>
							<Controller
								name="firstName"
								control={form.control}
								render={({ field, fieldState }) => (
									<Field data-invalid={fieldState.invalid ? "true" : undefined}>
										<FieldLabel htmlFor="signup-firstName">First name</FieldLabel>
										<Input
											{...field}
											id="signup-firstName"
											autoComplete="given-name"
											aria-invalid={fieldState.invalid}
										/>
										{fieldState.invalid && (
											<FieldError errors={[fieldState.error]} />
										)}
									</Field>
								)}
							/>
							<Controller
								name="lastName"
								control={form.control}
								render={({ field, fieldState }) => (
									<Field data-invalid={fieldState.invalid ? "true" : undefined}>
										<FieldLabel htmlFor="signup-lastName">Last name</FieldLabel>
										<Input
											{...field}
											id="signup-lastName"
											autoComplete="family-name"
											aria-invalid={fieldState.invalid}
										/>
										{fieldState.invalid && (
											<FieldError errors={[fieldState.error]} />
										)}
									</Field>
								)}
							/>
							<Controller
								name="email"
								control={form.control}
								render={({ field, fieldState }) => (
									<Field data-invalid={fieldState.invalid ? "true" : undefined}>
										<FieldLabel htmlFor="signup-email">Email</FieldLabel>
										<Input
											{...field}
											id="signup-email"
											type="email"
											autoComplete="email"
											aria-invalid={fieldState.invalid}
										/>
										{fieldState.invalid && (
											<FieldError errors={[fieldState.error]} />
										)}
									</Field>
								)}
							/>
							<Controller
								name="password"
								control={form.control}
								render={({ field, fieldState }) => (
									<Field data-invalid={fieldState.invalid ? "true" : undefined}>
										<FieldLabel htmlFor="signup-password">Password</FieldLabel>
										<Input
											{...field}
											id="signup-password"
											type="password"
											autoComplete="new-password"
											aria-invalid={fieldState.invalid}
										/>
										<FieldDescription>At least 8 characters.</FieldDescription>
										{fieldState.invalid && (
											<FieldError errors={[fieldState.error]} />
										)}
									</Field>
								)}
							/>
							<Controller
								name="confirmPassword"
								control={form.control}
								render={({ field, fieldState }) => (
									<Field data-invalid={fieldState.invalid ? "true" : undefined}>
										<FieldLabel htmlFor="signup-confirmPassword">
											Confirm password
										</FieldLabel>
										<Input
											{...field}
											id="signup-confirmPassword"
											type="password"
											autoComplete="new-password"
											aria-invalid={fieldState.invalid}
										/>
										{fieldState.invalid && (
											<FieldError errors={[fieldState.error]} />
										)}
									</Field>
								)}
							/>
							<Controller
								name="role"
								control={form.control}
								render={({ field, fieldState }) => (
									<Field data-invalid={fieldState.invalid ? "true" : undefined}>
										<FieldTitle>Account type</FieldTitle>
										<RadioGroup
											value={field.value}
											onValueChange={field.onChange}
											className="flex flex-col gap-3 sm:flex-row sm:gap-6"
										>
											<label className="flex cursor-pointer items-center gap-2 text-sm">
												<RadioGroupItem value="faculty" id="signup-role-faculty" />
												<span>Faculty</span>
											</label>
											<label className="flex cursor-pointer items-center gap-2 text-sm">
												<RadioGroupItem value="student" id="signup-role-student" />
												<span>Student</span>
											</label>
										</RadioGroup>
										{fieldState.invalid && (
											<FieldError errors={[fieldState.error]} />
										)}
									</Field>
								)}
							/>
						</FieldGroup>
					</FieldSet>
				</form>
			</CardContent>
			<CardFooter className="flex flex-col gap-3 sm:flex-row sm:justify-end">
				<Button type="submit" form={FORM_ID} disabled={form.formState.isSubmitting}>
					{form.formState.isSubmitting ? "Creating…" : "Sign up"}
				</Button>
				<p className="text-center text-sm text-muted-foreground sm:mr-auto sm:text-left">
					Already have an account?{" "}
					<Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
						Log in
					</Link>
				</p>
			</CardFooter>
		</Card>
	);
}
