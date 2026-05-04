import { z } from "zod";

import type { McqSortField } from "@/lib/services/mcq-service";

export const MCQ_SORT_VALUES: [
	McqSortField,
	...McqSortField[],
] = [
	"updated_at_desc",
	"updated_at_asc",
	"prompt_asc",
	"prompt_desc",
];

const mcqOptionBodySchema = z.object({
	body: z.string().trim().min(1, "Option text is required").max(2000),
	isCorrect: z.boolean(),
});

export const mcqWriteBodySchema = z
	.object({
		prompt: z.string().trim().min(1, "Question text is required").max(10000),
		options: z.array(mcqOptionBodySchema).min(2, "At least two options are required"),
	})
	.superRefine((data, ctx) => {
		const correct = data.options.filter((o) => o.isCorrect).length;
		if (correct !== 1) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Exactly one option must be marked correct",
				path: ["options"],
			});
		}
	});

export type McqWriteBody = z.infer<typeof mcqWriteBodySchema>;

export const listMcqsQuerySchema = z.object({
	page: z.coerce.number().int().min(1).optional().default(1),
	pageSize: z.coerce.number().int().min(1).max(50).optional().default(15),
	sort: z.enum(MCQ_SORT_VALUES).optional().default("updated_at_desc"),
	q: z.string().max(500).optional(),
});

export type ListMcqsQuery = z.infer<typeof listMcqsQuerySchema>;
