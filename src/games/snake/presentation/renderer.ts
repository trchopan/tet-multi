import type { RoomSnapshot } from '../../../shared/types';
import type { RectBounds } from '../../types';
import type { SnakeGameState } from '../types';

const PLAYER_COLORS = [
	{ head: '#4ade80', body: '#22c55e' }, // Green
	{ head: '#38bdf8', body: '#0284c7' }, // Cyan
	{ head: '#f43f5e', body: '#e11d48' }, // Pink/Red
	{ head: '#fbbf24', body: '#d97706' }, // Yellow/Amber
	{ head: '#a855f7', body: '#7e22ce' }, // Purple
];

export const renderSnakeSharedView = (
	ctx: CanvasRenderingContext2D,
	room: RoomSnapshot,
	bounds: RectBounds,
): void => {
	const gameState = room.customGameState as SnakeGameState | undefined;
	ctx.clearRect(0, 0, bounds.width, bounds.height);

	// Background
	ctx.fillStyle = '#0f172a';
	ctx.fillRect(0, 0, bounds.width, bounds.height);

	if (!gameState) {
		ctx.fillStyle = '#94a3b8';
		ctx.font = '16px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(
			'Waiting for Snake Arena match to start...',
			bounds.width / 2,
			bounds.height / 2,
		);
		return;
	}

	const gridW = gameState.gridWidth || 40;
	const gridH = gameState.gridHeight || 30;

	const cellW = bounds.width / gridW;
	const cellH = bounds.height / gridH;

	// Subtle Grid Lines
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
	ctx.lineWidth = 1;
	for (let x = 0; x <= gridW; x++) {
		ctx.beginPath();
		ctx.moveTo(x * cellW, 0);
		ctx.lineTo(x * cellW, bounds.height);
		ctx.stroke();
	}
	for (let y = 0; y <= gridH; y++) {
		ctx.beginPath();
		ctx.moveTo(0, y * cellH);
		ctx.lineTo(bounds.width, y * cellH);
		ctx.stroke();
	}

	// Render Food (Glowing dots)
	ctx.save();
	for (const food of gameState.food) {
		const cx = (food.x + 0.5) * cellW;
		const cy = (food.y + 0.5) * cellH;
		const radius = Math.min(cellW, cellH) * 0.35;

		ctx.shadowColor = '#f43f5e';
		ctx.shadowBlur = 8;
		ctx.fillStyle = '#fb7185';

		ctx.beginPath();
		ctx.arc(cx, cy, radius, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();

	// Render Snakes
	for (const player of room.players) {
		const snakeData = gameState.snakes[player.playerId];
		if (
			!snakeData ||
			snakeData.matchState === 'eliminated' ||
			snakeData.body.length === 0
		)
			continue;

		const color = PLAYER_COLORS[snakeData.colorIndex % PLAYER_COLORS.length]!;

		// Draw body segments
		ctx.fillStyle = color.body;
		for (let i = snakeData.body.length - 1; i > 0; i--) {
			const seg = snakeData.body[i]!;
			const lvl = snakeData.levels?.[i] ?? 1;
			const pad = 1;
			ctx.fillRect(
				seg.x * cellW + pad,
				seg.y * cellH + pad,
				Math.max(1, cellW - pad * 2),
				Math.max(1, cellH - pad * 2),
			);
			if (lvl > 1) {
				ctx.fillStyle = '#ffffff';
				ctx.font = 'bold 9px sans-serif';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(`${lvl}`, (seg.x + 0.5) * cellW, (seg.y + 0.5) * cellH);
				ctx.fillStyle = color.body;
			}
		}

		// Draw Head
		const head = snakeData.body[0]!;
		const headLvl = snakeData.levels?.[0] ?? 1;
		ctx.fillStyle = color.head;
		ctx.fillRect(
			head.x * cellW + 1,
			head.y * cellH + 1,
			Math.max(1, cellW - 2),
			Math.max(1, cellH - 2),
		);
		if (headLvl > 1) {
			ctx.fillStyle = '#ffffff';
			ctx.font = 'bold 9px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(
				`${headLvl}`,
				(head.x + 0.5) * cellW,
				(head.y + 0.5) * cellH,
			);
			ctx.fillStyle = color.head;
		}

		// Draw Head Eyes
		ctx.fillStyle = '#ffffff';
		const eyeSize = Math.max(2, Math.min(cellW, cellH) * 0.2);
		let eye1X = (head.x + 0.3) * cellW;
		let eye1Y = (head.y + 0.3) * cellH;
		let eye2X = (head.x + 0.7) * cellW;
		let eye2Y = (head.y + 0.7) * cellH;

		if (snakeData.direction === 'down') {
			eye1Y = eye2Y = (head.y + 0.7) * cellH;
		} else if (snakeData.direction === 'left') {
			eye1X = eye2X = (head.x + 0.3) * cellW;
			eye1Y = (head.y + 0.3) * cellH;
			eye2Y = (head.y + 0.7) * cellH;
		} else if (snakeData.direction === 'right') {
			eye1X = eye2X = (head.x + 0.7) * cellW;
			eye1Y = (head.y + 0.3) * cellH;
			eye2Y = (head.y + 0.7) * cellH;
		}

		ctx.beginPath();
		ctx.arc(eye1X, eye1Y, eyeSize, 0, Math.PI * 2);
		ctx.arc(eye2X, eye2Y, eyeSize, 0, Math.PI * 2);
		ctx.fill();
	}
};
