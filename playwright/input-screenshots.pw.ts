import { expect, test } from '@playwright/test';
import { mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const outputDir = join(process.cwd(), 'local', 'screenshots');
const artifactDir = process.env.ARTIFACT_DIR;

test.beforeAll(async () => {
	await mkdir(outputDir, { recursive: true });
});

const games = [
	{ id: 'falling-blocks', name: 'Falling Blocks' },
	{ id: 'snake', name: 'Snake Arena' },
	{ id: 'poker', name: "Texas Hold'em Poker" },
];

for (const game of games) {
	test(`capture input UI for ${game.name} on desktop`, async ({ browser }) => {
		const context = await browser.newContext({
			viewport: { width: 1280, height: 900 },
		});
		const page = await context.newPage();

		await page.goto('/');
		await page.getByRole('button', { name: 'Create room' }).click();
		await page.getByLabel('Display name').fill('PlayerOne');

		const gameSelect = page.locator('#game-select');
		if (await gameSelect.isVisible()) {
			await gameSelect.selectOption(game.id);
		}

		await page.getByRole('button', { name: 'Create room' }).click();
		await expect(page.getByText(/Waiting room/i)).toBeVisible({
			timeout: 10_000,
		});

		const addBotBtn = page.getByRole('button', { name: /Add.*computer/i });
		if (await addBotBtn.isVisible()) {
			await addBotBtn.click();
		}

		await page.getByRole('button', { name: 'Ready up' }).click();
		const startBtn = page.getByRole('button', { name: 'Start match' });
		await expect(startBtn).toBeEnabled();
		await startBtn.click();

		await expect(page.locator('[data-match-id]')).toBeVisible({
			timeout: 10_000,
		});

		// Wait for countdown to finish so gameplay and gamepad controls are fully visible
		await page
			.locator('.countdown')
			.waitFor({ state: 'detached', timeout: 10_000 })
			.catch(() => {});
		await page.waitForTimeout(500);

		const fileName = `input-${game.id}-desktop.png`;
		const filePath = join(outputDir, fileName);
		await page.screenshot({ path: filePath, fullPage: true });

		if (artifactDir) {
			try {
				await copyFile(filePath, join(artifactDir, fileName));
			} catch {
				// ignore
			}
		}

		await context.close();
	});

	test(`capture input UI for ${game.name} on mobile`, async ({ browser }) => {
		const context = await browser.newContext({
			viewport: { width: 390, height: 844 },
			isMobile: true,
			hasTouch: true,
		});
		const page = await context.newPage();

		await page.goto('/');
		await page.getByRole('button', { name: 'Create room' }).click();
		await page.getByLabel('Display name').fill('MobilePlayer');

		const gameSelect = page.locator('#game-select');
		if (await gameSelect.isVisible()) {
			await gameSelect.selectOption(game.id);
		}

		await page.getByRole('button', { name: 'Create room' }).click();
		await expect(page.getByText(/Waiting room/i)).toBeVisible({
			timeout: 10_000,
		});

		const addBotBtn = page.getByRole('button', { name: /Add.*computer/i });
		if (await addBotBtn.isVisible()) {
			await addBotBtn.click();
		}

		await page.getByRole('button', { name: 'Ready up' }).click();
		const startBtn = page.getByRole('button', { name: 'Start match' });
		await expect(startBtn).toBeEnabled();
		await startBtn.click();

		await expect(page.locator('[data-match-id]')).toBeVisible({
			timeout: 10_000,
		});

		// Wait for countdown to finish so gameplay and gamepad controls are fully visible
		await page
			.locator('.countdown')
			.waitFor({ state: 'detached', timeout: 10_000 })
			.catch(() => {});
		await page.waitForTimeout(500);

		const fileName = `input-${game.id}-mobile.png`;
		const filePath = join(outputDir, fileName);
		await page.screenshot({ path: filePath, fullPage: true });

		if (artifactDir) {
			try {
				await copyFile(filePath, join(artifactDir, fileName));
			} catch {
				// ignore
			}
		}

		await context.close();
	});
}
