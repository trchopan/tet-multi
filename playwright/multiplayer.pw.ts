import { expect, test } from '@playwright/test';

const ready = async (page: import('@playwright/test').Page): Promise<void> => {
	await page.getByRole('button', { name: 'Ready up' }).click();
};

test('two browser contexts complete a synchronized match and return to lobby', async ({
	browser,
}, testInfo) => {
	testInfo.setTimeout(120_000);
	const host = await browser.newContext();
	const guest = await browser.newContext();
	const hostPage = await host.newPage();
	const guestPage = await guest.newPage();

	try {
		await hostPage.goto('/');
		await hostPage.getByLabel('Display name').fill('Alice');
		await hostPage.getByRole('button', { name: 'Create room' }).click();
		await expect(hostPage.getByRole('heading', { name: /Room/ })).toBeVisible();
		const roomCode = await hostPage.locator('h1').textContent();
		expect(roomCode).toMatch(/Room [A-Z2-9]{6}/);
		const code = roomCode?.replace('Room ', '').trim();
		if (code === undefined) throw new Error('Room code was not rendered');

		await guestPage.goto(`/room/${code}`);
		await guestPage.getByLabel('Display name').fill('Bob');
		await guestPage.getByLabel('Room code').fill(code);
		await guestPage.getByRole('button', { name: 'Join room' }).click();
		await expect(guestPage.getByText('Waiting room')).toBeVisible();
		await expect(hostPage.getByText('Bob')).toBeVisible();
		await expect(guestPage.getByText('Alice')).toBeVisible();

		await ready(hostPage);
		await ready(guestPage);
		await expect(
			hostPage.getByRole('button', { name: 'Start match' }),
		).toBeEnabled();
		await hostPage.getByRole('button', { name: 'Start match' }).click();
		await expect(hostPage.locator('.countdown')).toBeVisible();
		await expect(guestPage.locator('.countdown')).toBeVisible();
		await expect(hostPage.locator('[data-match-id]')).toBeVisible({
			timeout: 8_000,
		});
		await expect(guestPage.locator('[data-match-id]')).toBeVisible({
			timeout: 8_000,
		});
		const hostMatchId = await hostPage
			.locator('[data-match-id]')
			.getAttribute('data-match-id');
		const guestMatchId = await guestPage
			.locator('[data-match-id]')
			.getAttribute('data-match-id');
		expect(hostMatchId).toBeTruthy();
		expect(guestMatchId).toBe(hostMatchId);

		const hostBoards = hostPage.locator('canvas');
		const guestBoards = guestPage.locator('canvas');
		await expect(hostBoards).toHaveCount(2);
		await expect(guestBoards).toHaveCount(2);
		const initialX = await hostBoards.first().getAttribute('data-active-x');
		await hostBoards.first().press('ArrowRight');
		await expect(hostBoards.first()).not.toHaveAttribute(
			'data-active-x',
			initialX ?? '',
		);
		await guestPage.close();
		const reconnectedGuestPage = await guest.newPage();
		await reconnectedGuestPage.goto(`/room/${code}`);
		await expect(reconnectedGuestPage.locator('[data-match-id]')).toBeVisible({
			timeout: 10_000,
		});
		await expect(reconnectedGuestPage.getByRole('status').first()).toHaveText(
			'Online',
		);

		const topOut = await hostPage.request.post('/__test__/top-out', {
			data: { roomCode: code },
		});
		expect(topOut.status()).toBe(204);
		await expect(hostPage.getByText('Match finished')).toBeVisible({
			timeout: 30_000,
		});
		await expect(reconnectedGuestPage.getByText('Match finished')).toBeVisible({
			timeout: 30_000,
		});
		const hostResults = hostPage.locator('[data-results-match-id]');
		const guestResults = reconnectedGuestPage.locator(
			'[data-results-match-id]',
		);
		expect(await hostResults.getAttribute('data-results-match-id')).toBe(
			hostMatchId,
		);
		expect(await guestResults.getAttribute('data-results-match-id')).toBe(
			hostMatchId,
		);
		expect(await guestResults.getAttribute('data-winner-player-ids')).toBe(
			await hostResults.getAttribute('data-winner-player-ids'),
		);

		await hostPage.getByRole('button', { name: 'Return to lobby' }).click();
		await expect(hostPage.getByText('Waiting room')).toBeVisible();
		await expect(reconnectedGuestPage.getByText('Waiting room')).toBeVisible();
	} finally {
		await host.close();
		await guest.close();
	}
});

test('a host can start a match against four computer players', async ({
	page,
}) => {
	await page.goto('/');
	await page.getByLabel('Display name').fill('Alice');
	await page.getByRole('button', { name: 'Create room' }).click();
	await expect(page.getByText('Waiting room')).toBeVisible();

	for (let index = 0; index < 4; index += 1)
		await page.getByRole('button', { name: 'Add computer' }).click();
	await expect(page.getByText('CPU 1')).toBeVisible();
	await expect(page.getByText('CPU 4')).toBeVisible();
	await page.getByRole('button', { name: 'Ready up' }).click();
	await page.getByRole('button', { name: 'Start match' }).click();

	await expect(page.locator('[data-match-id]')).toBeVisible({ timeout: 8_000 });
	await expect(page.locator('canvas')).toHaveCount(5);
});
