import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const outputDirectory = join(process.cwd(), 'local', 'screenshots');
const viewports = [
	{ name: 'desktop', width: 1440, height: 1000 },
	{ name: 'tablet', width: 600, height: 800 },
	{ name: 'mobile', width: 390, height: 844 },
] as const;

const createRoom = async (page: Page, displayName: string): Promise<string> => {
	await page.goto('/');
	await page.getByLabel('Display name').fill(displayName);
	await page.getByRole('button', { name: 'Create room' }).click();
	await expect(page.getByText('Waiting room')).toBeVisible();

	const heading = await page.locator('h1').textContent();
	const roomCode = heading?.match(/Room ([A-Z2-9]{6})/)?.[1];
	if (roomCode === undefined) throw new Error('Room code was not rendered');
	return roomCode;
};

const joinRoom = async (
	page: Page,
	roomCode: string,
	displayName: string,
): Promise<void> => {
	await page.goto(`/room/${roomCode}`);
	await page.getByLabel('Display name').fill(displayName);
	await page.getByLabel('Room code').fill(roomCode);
	await page.getByRole('button', { name: 'Join room' }).click();
	await expect(page.getByText('Waiting room')).toBeVisible();
};

test.describe('waiting room layout and states', () => {
	test.describe.configure({ mode: 'serial' });

	for (const viewport of viewports) {
		test(`${viewport.name} waiting room`, async ({ browser }) => {
			await mkdir(outputDirectory, { recursive: true });
			const contexts: BrowserContext[] = [];

			try {
				const hostContext = await browser.newContext({
					viewport: { width: viewport.width, height: viewport.height },
					permissions: ['clipboard-read', 'clipboard-write'],
				});
				contexts.push(hostContext);
				const hostPage = await hostContext.newPage();
				const roomCode = await createRoom(hostPage, 'Alice');

				await expect(
					hostPage.getByRole('button', { name: 'Copy invite URL' }),
				).toBeVisible();
				await expect(hostPage.getByText('1 / 5 players')).toBeVisible();
				await expect(hostPage.locator('.empty-slot')).toHaveCount(4);
				await expect(
					hostPage.getByRole('button', { name: 'Start match' }),
				).toBeDisabled();
				const startButton = hostPage.getByRole('button', {
					name: 'Start match',
				});
				await expect(startButton).toHaveAttribute(
					'aria-describedby',
					'start-match-reason',
				);
				await expect(hostPage.locator('#start-match-reason')).toHaveText(
					'At least two connected players are required.',
				);

				await hostPage.getByRole('button', { name: 'Copy invite URL' }).click();
				await expect(
					hostPage.getByRole('button', { name: 'Invite copied' }),
				).toBeVisible();

				const guestContext = await browser.newContext({
					viewport: { width: viewport.width, height: viewport.height },
				});
				contexts.push(guestContext);
				const guestPage = await guestContext.newPage();
				await joinRoom(guestPage, roomCode, 'Bob');

				await expect(
					guestPage.getByRole('heading', { name: 'Waiting for the host' }),
				).toBeVisible();
				await expect(hostPage.getByText('2 / 5 players')).toBeVisible();
				await expect(hostPage.locator('.empty-slot')).toHaveCount(3);

				await hostPage.getByRole('button', { name: 'Add computer' }).click();
				await expect(hostPage.getByText('CPU 1')).toBeVisible();
				await expect(
					hostPage.getByRole('button', { name: 'Remove' }),
				).toBeVisible();
				await hostPage.getByRole('button', { name: 'Remove' }).click();
				await expect(hostPage.getByText('CPU 1')).toHaveCount(0);

				const layout = await hostPage.evaluate(() => ({
					documentWidth: document.scrollingElement?.scrollWidth ?? 0,
					viewportWidth: window.innerWidth,
					overflowingElements: [...document.querySelectorAll('*')]
						.filter((element) => {
							const rect = element.getBoundingClientRect();
							return rect.left < -1 || rect.right > window.innerWidth + 1;
						})
						.map((element) => element.tagName.toLowerCase()),
				}));
				expect(layout.documentWidth).toBeLessThanOrEqual(
					layout.viewportWidth + 1,
				);
				expect(layout.overflowingElements).toEqual([]);

				await hostPage.screenshot({
					path: join(outputDirectory, `lobby-${viewport.name}.png`),
					fullPage: true,
					animations: 'disabled',
					caret: 'hide',
				});
			} finally {
				await Promise.all(contexts.map((context) => context.close()));
			}
		});
	}
});
