import { Suspense } from "react";

import { FacultyMcqDashboard } from "@/components/faculty/faculty-mcq-dashboard";
import { Skeleton } from "@/components/ui/skeleton";

function FacultyMcqFallback() {
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 md:p-8">
			<Skeleton className="h-9 w-48" />
			<Skeleton className="h-64 w-full" />
		</main>
	);
}

export default function FacultyMcqListPage() {
	return (
		<Suspense fallback={<FacultyMcqFallback />}>
			<FacultyMcqDashboard />
		</Suspense>
	);
}
