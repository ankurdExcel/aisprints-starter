import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		globals: false,
		setupFiles: ["./vitest.setup.ts"],
		environment: "node",
		environmentMatchGlobs: [
			["**/*.test.tsx", "jsdom"],
			/** Colocated `page.test.ts` next to App Router `page.tsx` (auth UI, etc.) */
			["**/page.test.ts", "jsdom"],
		],
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		exclude: ["node_modules", ".next"],
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
