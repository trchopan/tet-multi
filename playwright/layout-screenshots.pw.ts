import { expect, test, type BrowserContext } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const outputDirectory = join(process.cwd(), 'local', 'screenshots');

const viewports = [
	{ name: 'desktop', width: 1440, height: 1000 },
	{ name: 'desktop-short', width: 1440, height: 700 },
	{ name: 'mobile', width: 390, height: 844 },
	{ name: 'mobile-short', width: 390, height: 667 },
] as const;

const playerNames = ['Alice', 'Bob', 'Casey', 'Drew', 'Emery'];
const playerCounts = [2, 3, 4, 5] as const;
type ViewportName = (typeof viewports)[number]['name'];

interface PageLayoutReport {
	localPlayerIndex: number;
	viewportWidth: number;
	viewportHeight: number;
	documentWidth: number;
	documentHeight: number;
	horizontalOverflow: boolean;
	verticalOverflow: boolean;
	localCanvasFullyVisible: boolean;
	localCanvasRequiresVerticalScroll: boolean;
	localCanvasWidth: number;
	localCanvasHeight: number;
	localCanvasBottom: number;
	nextPanelTop: number;
	statsTop: number;
	overflowingElements: string[];
}

interface LayoutReport {
	playerCount: number;
	viewport: ViewportName;
	status: 'pending' | 'passed' | 'failed';
	pages: PageLayoutReport[];
	error?: string;
}

const layoutReports = new Map<string, LayoutReport>();

for (const viewport of viewports) {
	for (const playerCount of playerCounts) {
		layoutReports.set(`${playerCount}-${viewport.name}`, {
			playerCount,
			viewport: viewport.name,
			status: 'pending',
			pages: [],
		});
	}
}

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
	await mkdir(outputDirectory, { recursive: true });
});
test.afterAll(async () => {
	await writeFile(
		join(outputDirectory, 'overflow-report.json'),
		`${JSON.stringify([...layoutReports.values()], null, 2)}\n`,
		'utf8',
	);
});

for (const viewport of viewports) {
	for (const playerCount of playerCounts) {
		test(`${playerCount} players at ${viewport.name}`, async ({ browser }) => {
			test.setTimeout(120_000);
			const report = layoutReports.get(`${playerCount}-${viewport.name}`);
			if (report === undefined)
				throw new Error('Layout report was not initialized');

			let contexts: BrowserContext[] = [];

			try {
				contexts = await Promise.all(
					playerNames.slice(0, playerCount).map(() =>
						browser.newContext({
							viewport: {
								width: viewport.width,
								height: viewport.height,
							},
						}),
					),
				);
				const pages = await Promise.all(
					contexts.map((context) => context.newPage()),
				);
				const hostPage = pages[0];
				const hostName = playerNames[0];
				if (hostPage === undefined || hostName === undefined)
					throw new Error('Host page was not created');

				await hostPage.goto('/');
				await hostPage.getByLabel('Display name').fill(hostName);
				await hostPage.getByRole('button', { name: 'Create room' }).click();
				await expect(hostPage.getByText('Waiting room')).toBeVisible();

				const heading = await hostPage.locator('h1').textContent();
				const roomCode = heading?.match(/Room ([A-Z2-9]{6})/)?.[1];
				if (roomCode === undefined)
					throw new Error('Room code was not rendered');

				for (let index = 1; index < pages.length; index += 1) {
					const page = pages[index];
					const displayName = playerNames[index];
					if (page === undefined || displayName === undefined)
						throw new Error('Player page was not created');

					await page.goto(`/room/${roomCode}`);
					await page.getByLabel('Display name').fill(displayName);
					await page.getByLabel('Room code').fill(roomCode);
					await page.getByRole('button', { name: 'Join room' }).click();
					await expect(page.getByText('Waiting room')).toBeVisible();
				}

				for (const page of pages) {
					await expect(
						page.getByText(`${playerCount} / 5 players`),
					).toBeVisible();
					await page.getByRole('button', { name: 'Ready up' }).click();
				}

				await expect(
					hostPage.getByRole('button', { name: 'Start match' }),
				).toBeEnabled();
				await hostPage.getByRole('button', { name: 'Start match' }).click();

				for (const [localPlayerIndex, page] of pages.entries()) {
					await expect(page.locator('[data-match-id]')).toBeVisible({
						timeout: 10_000,
					});
					await expect(page.locator('canvas')).toHaveCount(playerCount);
					if (viewport.name === 'mobile') {
						await expect(page.locator('#opponent-boards')).toBeHidden();
						await page.getByRole('button', { name: 'Show opponents' }).click();
						await expect(page.locator('#opponent-boards')).toBeVisible();
						await expect(page.locator('#opponent-boards canvas')).toHaveCount(
							playerCount - 1,
						);
						await page.getByRole('button', { name: 'Hide opponents' }).click();
						await expect(page.locator('#opponent-boards')).toBeHidden();
					}

					const layout = await page.evaluate(() => {
						const root = document.scrollingElement;
						const localCanvas = document.querySelector('.card.local canvas');
						const localRect = localCanvas?.getBoundingClientRect();
						const documentWidth = root?.scrollWidth ?? 0;
						const documentHeight = root?.scrollHeight ?? 0;
						const overflowingElements = [...document.querySelectorAll('*')]
							.filter((element) => {
								const rect = element.getBoundingClientRect();
								return rect.left < -1 || rect.right > window.innerWidth + 1;
							})
							.map((element) => {
								const className = element.getAttribute('class');
								return `${element.tagName.toLowerCase()}${
									className === null ? '' : `.${className.replaceAll(' ', '.')}`
								}`;
							});

						return {
							viewportWidth: window.innerWidth,
							viewportHeight: window.innerHeight,
							documentWidth,
							documentHeight,
							horizontalOverflow: documentWidth > window.innerWidth + 1,
							verticalOverflow: documentHeight > window.innerHeight + 1,
							localCanvasFullyVisible:
								localRect !== undefined &&
								localRect.top >= 0 &&
								localRect.bottom <= window.innerHeight,
							localCanvasRequiresVerticalScroll:
								localRect !== undefined &&
								(localRect.top < 0 || localRect.bottom > window.innerHeight),
							localCanvasWidth: localRect?.width ?? 0,
							localCanvasHeight: localRect?.height ?? 0,
							localCanvasBottom: localRect?.bottom ?? 0,
							nextPanelTop:
								document.querySelector('.next-panel')?.getBoundingClientRect()
									.top ?? 0,
							statsTop:
								document
									.querySelector('.card.local .stats')
									?.getBoundingClientRect().top ?? 0,
							overflowingElements,
						};
					});

					report.pages.push({ localPlayerIndex, ...layout });
					expect(
						layout.verticalOverflow,
						`${playerCount} players at ${viewport.name}, document exceeds the viewport`,
					).toBe(false);
					expect(
						layout.horizontalOverflow,
						`${playerCount} players at ${viewport.name}, local player ${localPlayerIndex + 1} has horizontal overflow: ${layout.overflowingElements.join(', ')}`,
					).toBe(false);
					if (viewport.name === 'mobile')
						expect(
							layout.localCanvasFullyVisible,
							`${playerCount} players at mobile, local player ${localPlayerIndex + 1} has a canvas outside the initial viewport`,
						).toBe(true);
					if (viewport.name.startsWith('mobile')) {
						expect(
							layout.localCanvasWidth,
							`${playerCount} players at ${viewport.name}, local board is too narrow`,
						).toBeGreaterThanOrEqual(120);
						expect(
							layout.localCanvasHeight,
							`${playerCount} players at ${viewport.name}, local board is too short`,
						).toBeGreaterThanOrEqual(240);
						expect(
							layout.nextPanelTop,
							`${playerCount} players at ${viewport.name}, next queue overlaps local board`,
						).toBeGreaterThanOrEqual(layout.localCanvasBottom - 1);
						expect(
							layout.statsTop,
							`${playerCount} players at ${viewport.name}, stats overlap local board`,
						).toBeGreaterThanOrEqual(layout.localCanvasBottom - 1);
					}
				}

				await hostPage.screenshot({
					path: join(
						outputDirectory,
						`players-${playerCount}-${viewport.name}.png`,
					),
					fullPage: true,
					animations: 'disabled',
					caret: 'hide',
				});
				report.status = 'passed';
			} catch (error) {
				report.status = 'failed';
				report.error = error instanceof Error ? error.message : String(error);
				throw error;
			} finally {
				await Promise.all(contexts.map((context) => context.close()));
			}
		});
	}
}
