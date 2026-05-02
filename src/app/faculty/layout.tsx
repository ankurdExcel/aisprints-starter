import { AppShellFooter } from "@/components/app/app-shell-footer";
import { AppShellHeader } from "@/components/app/app-shell-header";

export default function FacultyLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-screen flex-col">
			<AppShellHeader homeHref="/faculty" />
			<div className="flex flex-1 flex-col">{children}</div>
			<AppShellFooter />
		</div>
	);
}
