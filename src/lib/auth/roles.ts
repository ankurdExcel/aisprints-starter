export type UserRole = "faculty" | "student";

export function isUserRole(value: unknown): value is UserRole {
	return value === "faculty" || value === "student";
}
