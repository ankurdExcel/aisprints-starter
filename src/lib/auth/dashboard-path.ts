import type { UserRole } from "@/lib/auth/roles";

export function dashboardPathForRole(role: UserRole): string {
	return role === "faculty" ? "/faculty" : "/student";
}
