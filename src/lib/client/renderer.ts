import {
	BOARD_HIDDEN_HEIGHT,
	BOARD_INTERNAL_HEIGHT,
	BOARD_VISIBLE_HEIGHT,
	BOARD_WIDTH,
} from '../../shared/constants';
import { canPlacePiece, pieceCells, type BoardCell } from '../../game/board';
import type { ActivePiece, GameEngineState } from '../../game/engine';
import { pieceValue } from '../../game/pieces';
import type { PlayerSnapshot } from '../../shared/types';

export interface CanvasMetrics {
	cssWidth: number;
	cssHeight: number;
	pixelWidth: number;
	pixelHeight: number;
	cellWidth: number;
	cellHeight: number;
}

export interface VisibleCellRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface SnapshotBoardState {
	board: { cells: BoardCell[] };
	activePiece?: ActivePiece;
	gameOver: boolean;
}

export const PIECE_COLORS: readonly string[] = [
	'#10121c',
	'#35d9ff',
	'#5271ff',
	'#ff9f43',
	'#ffe66d',
	'#58e38c',
	'#c77dff',
	'#ff5c8a',
	'#8d96a8',
];

export const getCanvasMetrics = (
	cssWidth: number,
	cssHeight = cssWidth * 2,
	dpr = 1,
): CanvasMetrics => {
	if (!Number.isFinite(cssWidth) || !Number.isFinite(cssHeight))
		throw new RangeError('Canvas dimensions must be finite');
	const width = Math.max(0, cssWidth);
	const height = Math.max(0, cssHeight);
	const pixelRatio = Math.max(1, Number.isFinite(dpr) ? dpr : 1);
	return {
		cssWidth: width,
		cssHeight: height,
		pixelWidth: Math.round(width * pixelRatio),
		pixelHeight: Math.round(height * pixelRatio),
		cellWidth: width / BOARD_WIDTH,
		cellHeight: height / BOARD_VISIBLE_HEIGHT,
	};
};

export const getVisibleCellRect = (
	metrics: CanvasMetrics,
	x: number,
	y: number,
): VisibleCellRect | undefined => {
	if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
	if (
		x < 0 ||
		x >= BOARD_WIDTH ||
		y < BOARD_HIDDEN_HEIGHT ||
		y >= BOARD_INTERNAL_HEIGHT
	)
		return undefined;
	return {
		x: x * metrics.cellWidth,
		y: (y - BOARD_HIDDEN_HEIGHT) * metrics.cellHeight,
		width: metrics.cellWidth,
		height: metrics.cellHeight,
	};
};

const getGhostPositionForState = (
	state: SnapshotBoardState,
): ActivePiece | undefined => {
	if (state.activePiece === undefined) return undefined;
	let y = state.activePiece.y;
	while (
		canPlacePiece(state.board, {
			...state.activePiece,
			y: y + 1,
		})
	)
		y += 1;
	return { ...state.activePiece, y };
};

export const getGhostPosition = (state: GameEngineState): ActivePiece =>
	getGhostPositionForState(state) as ActivePiece;

const colorForValue = (value: number): string =>
	PIECE_COLORS[value] ?? PIECE_COLORS[0] ?? '#10121c';

const drawCells = (
	context: CanvasRenderingContext2D,
	metrics: CanvasMetrics,
	cells: ReadonlyArray<{ x: number; y: number }>,
	color: string,
	alpha = 1,
): void => {
	context.save();
	context.globalAlpha = alpha;
	context.fillStyle = color;
	for (const cell of cells) {
		const rect = getVisibleCellRect(metrics, cell.x, cell.y);
		if (rect === undefined) continue;
		context.fillRect(
			rect.x + 1,
			rect.y + 1,
			Math.max(0, rect.width - 2),
			Math.max(0, rect.height - 2),
		);
	}
	context.restore();
};

export const renderBoard = (
	context: CanvasRenderingContext2D,
	state: GameEngineState | SnapshotBoardState,
	metrics: CanvasMetrics,
): void => {
	context.clearRect(0, 0, metrics.cssWidth, metrics.cssHeight);
	context.fillStyle = '#10121c';
	context.fillRect(0, 0, metrics.cssWidth, metrics.cssHeight);

	for (let y = BOARD_HIDDEN_HEIGHT; y < BOARD_INTERNAL_HEIGHT; y += 1) {
		for (let x = 0; x < BOARD_WIDTH; x += 1) {
			const value = state.board.cells[y * BOARD_WIDTH + x] ?? 0;
			if (value === 0) continue;
			const rect = getVisibleCellRect(metrics, x, y);
			if (rect === undefined) continue;
			context.fillStyle = colorForValue(value);
			context.fillRect(
				rect.x + 1,
				rect.y + 1,
				Math.max(0, rect.width - 2),
				Math.max(0, rect.height - 2),
			);
		}
	}

	const ghost = getGhostPositionForState(state);
	if (ghost !== undefined)
		drawCells(
			context,
			metrics,
			pieceCells(ghost),
			colorForValue(pieceValue(ghost.kind)),
			0.22,
		);
	if (state.activePiece !== undefined)
		drawCells(
			context,
			metrics,
			pieceCells(state.activePiece),
			colorForValue(pieceValue(state.activePiece.kind)),
		);

	context.strokeStyle = 'rgba(255, 255, 255, 0.08)';
	context.lineWidth = 1;
	for (let x = 1; x < BOARD_WIDTH; x += 1) {
		const position = x * metrics.cellWidth;
		context.beginPath();
		context.moveTo(position, 0);
		context.lineTo(position, metrics.cssHeight);
		context.stroke();
	}
	for (let y = 1; y < BOARD_VISIBLE_HEIGHT; y += 1) {
		const position = y * metrics.cellHeight;
		context.beginPath();
		context.moveTo(0, position);
		context.lineTo(metrics.cssWidth, position);
		context.stroke();
	}

	if (state.gameOver) {
		context.fillStyle = 'rgba(16, 18, 28, 0.78)';
		context.fillRect(0, 0, metrics.cssWidth, metrics.cssHeight);
	}
};

export const snapshotToBoardState = (
	player: PlayerSnapshot,
): SnapshotBoardState => ({
	board: {
		cells: [...(player.board ?? Array(240).fill(0))] as BoardCell[],
	},
	...(player.activePiece === undefined
		? {}
		: { activePiece: { ...player.activePiece } }),
	gameOver: player.matchState === 'eliminated',
});

export const renderSnapshotBoard = (
	context: CanvasRenderingContext2D,
	player: PlayerSnapshot,
	metrics: CanvasMetrics,
): void => renderBoard(context, snapshotToBoardState(player), metrics);
