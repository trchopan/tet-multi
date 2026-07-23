import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './playwright',
	testMatch: '**/*.pw.ts',
	timeout: 30_000,
	use: {
		baseURL: 'http://127.0.0.1:4173',
		headless: true,
	},
	webServer: {
		command:
			'bun run build && PORT=4173 NODE_ENV=test RECONNECT_GRACE_MS=1000 bun run src/server/index.ts',
		url: 'http://127.0.0.1:4173/health',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
