import { getRotationCells, type PieceKind } from '../../games/falling-blocks';

const PREVIEW_WIDTH = 4;

export const getPreviewCellIndexes = (piece: PieceKind): readonly number[] => {
	const source = getRotationCells(piece, 0);
	const minX = Math.min(...source.map((cell) => cell.x));
	const maxX = Math.max(...source.map((cell) => cell.x));
	const minY = Math.min(...source.map((cell) => cell.y));
	const maxY = Math.max(...source.map((cell) => cell.y));
	const offsetX = Math.floor((PREVIEW_WIDTH - (maxX - minX + 1)) / 2);
	const offsetY = Math.floor((2 - (maxY - minY + 1)) / 2);

	return source.map(
		({ x, y }) => (y - minY + offsetY) * PREVIEW_WIDTH + (x - minX + offsetX),
	);
};
