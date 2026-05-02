import { z } from "zod";

import { loginBodySchema, signupBodySchema } from "@/lib/auth/auth-schemas";

/** Signup form: same fields as API plus confirmation (not sent to API). */
export const signupFormSchema = signupBodySchema
	.extend({
		confirmPassword: z.string().min(1, "Confirm your password"),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});

export type SignupFormValues = z.infer<typeof signupFormSchema>;

export const loginFormSchema = loginBodySchema;

export type LoginFormValues = z.infer<typeof loginFormSchema>;
