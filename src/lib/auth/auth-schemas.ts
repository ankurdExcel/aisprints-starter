import { z } from "zod";

export const signupBodySchema = z.object({
	firstName: z.string().trim().min(1).max(100),
	lastName: z.string().trim().min(1).max(100),
	email: z
		.string()
		.trim()
		.email()
		.max(320)
		.transform((e) => e.toLowerCase()),
	password: z.string().min(8).max(128),
	role: z.enum(["faculty", "student"]),
});

export const loginBodySchema = z.object({
	email: z
		.string()
		.trim()
		.email()
		.max(320)
		.transform((e) => e.toLowerCase()),
	password: z.string().min(1).max(128),
});

export type SignupBody = z.infer<typeof signupBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;

export function formatZodError(error: z.ZodError): {
	message: string;
	fieldErrors: Record<string, string[] | undefined>;
} {
	const flat = error.flatten();
	return {
		message: "Validation failed",
		fieldErrors: flat.fieldErrors,
	};
}
