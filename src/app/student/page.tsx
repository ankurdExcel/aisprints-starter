export default function StudentHomePage() {
	return (
		<main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6 md:p-8">
			<div>
				<h1 className="font-heading text-2xl font-semibold tracking-tight">Quizzes</h1>
				<p className="text-sm text-muted-foreground">
					Assigned quizzes will appear here when your instructor shares them.
				</p>
			</div>
			<p className="text-sm text-muted-foreground">No quizzes available.</p>
		</main>
	);
}
