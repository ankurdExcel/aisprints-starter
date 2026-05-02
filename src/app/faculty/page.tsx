import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function FacultyMcqListPage() {
	return (
		<main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6 md:p-8">
			<div>
				<h1 className="font-heading text-2xl font-semibold tracking-tight">MCQs</h1>
				<p className="text-sm text-muted-foreground">
					Create and manage multiple-choice quizzes for your classes.
				</p>
			</div>
			<Card>
				<CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
					<div className="space-y-1">
						<CardTitle className="text-base">Your quizzes</CardTitle>
						<CardDescription>
							Quizzes you create appear here. MCQ authoring will follow the MCQ product
							specification.
						</CardDescription>
					</div>
					<Button type="button" disabled title="Available after MCQ implementation">
						Create MCQ
					</Button>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">No MCQs available.</p>
				</CardContent>
			</Card>
		</main>
	);
}
