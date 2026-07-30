import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const outputDir = join(process.cwd(), 'local', 'poker-screenshots');

test('Texas Holdem Poker match flow debug', async ({ page }) => {
	await mkdir(outputDir, { recursive: true });

	const logs: string[] = [];
	page.on('console', (msg) =>
		logs.push(`[CONSOLE ${msg.type()}] ${msg.text()}`),
	);
	page.on('pageerror', (err) =>
		logs.push(`[PAGE ERROR] ${err.stack ?? err.message}`),
	);

	// 1. Navigate to home
	await page.goto('/');
	await page.getByRole('button', { name: 'Create room' }).click();

	// 2. Select Texas Hold'em Poker
	await page.getByLabel('Display name').fill('Alice');
	await page.getByLabel('Select Game Plugin').selectOption('poker');
	await page.screenshot({ path: join(outputDir, '1-create-poker-room.png') });
	await page.getByRole('button', { name: 'Create room' }).click();

	// 3. Lobby
	await page.waitForURL(/\/room\/[A-Z0-9]+/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Room/i);
	await page.screenshot({ path: join(outputDir, '2-poker-lobby.png') });

	// 4. Add Computer Player & Start Match
	await page.getByRole('button', { name: 'Add computer' }).click();
	await page.screenshot({
		path: join(outputDir, '3-poker-lobby-with-cpu.png'),
	});

	await page.getByRole('button', { name: 'Ready up' }).click();
	await page.getByRole('button', { name: 'Start match' }).click();

	// 5. Wait past countdown and match play
	await page.waitForTimeout(4000);
	await page.screenshot({ path: join(outputDir, '4-poker-match-playing.png') });

	console.log('--- BROWSER CONSOLE LOGS ---');
	console.log(logs.join('\n'));
});
