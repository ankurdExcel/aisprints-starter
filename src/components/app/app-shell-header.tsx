"use client";

import { UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type AppShellHeaderProps = {
	/** Role home, e.g. `/faculty` or `/student`. */
	homeHref: string;
};

export function AppShellHeader({ homeHref }: AppShellHeaderProps) {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	async function handleLogout() {
		setPending(true);
		try {
			const res = await fetch("/api/auth/logout", {
				method: "POST",
				credentials: "include",
			});
			if (!res.ok) {
				toast.error("Could not sign out. Try again.");
				return;
			}
			router.push("/login");
			router.refresh();
		} catch {
			toast.error("Could not sign out. Try again.");
		} finally {
			setPending(false);
		}
	}

	return (
		<header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
			<div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
				<Link
					href={homeHref}
					className="font-heading text-lg font-semibold tracking-tight text-foreground hover:opacity-90"
				>
					QuizMaker
				</Link>
				<div className="flex items-center gap-3">
					<div
						className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground"
						aria-label="Profile (placeholder)"
					>
						<UserIcon className="size-5 shrink-0" aria-hidden />
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={pending}
						onClick={() => void handleLogout()}
					>
						{pending ? "Signing out…" : "Log out"}
					</Button>
				</div>
			</div>
		</header>
	);
}
