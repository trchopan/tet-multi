import type { Card, Rank, Suit } from '$/games/poker/types';

const RANK_LABELS: Record<Rank, string> = {
	14: 'A',
	13: 'K',
	12: 'Q',
	11: 'J',
	10: '10',
	9: '9',
	8: '8',
	7: '7',
	6: '6',
	5: '5',
	4: '4',
	3: '3',
	2: '2',
};

export function drawSuitSymbol(
	ctx: CanvasRenderingContext2D,
	suit: Suit,
	cx: number,
	cy: number,
	size: number,
	color?: string,
): void {
	ctx.save();

	const isRed = suit === 'hearts' || suit === 'diamonds';
	const fill = color ?? (isRed ? '#dc2626' : '#0f172a');

	if (suit === 'hearts') {
		ctx.fillStyle = fill;
		ctx.beginPath();
		ctx.moveTo(cx, cy + size * 0.42);
		ctx.bezierCurveTo(
			cx - size * 0.25,
			cy + size * 0.2,
			cx - size * 0.5,
			cy,
			cx - size * 0.5,
			cy - size * 0.22,
		);
		ctx.arc(cx - size * 0.24, cy - size * 0.22, size * 0.25, Math.PI, 0);
		ctx.arc(cx + size * 0.24, cy - size * 0.22, size * 0.25, Math.PI, 0);
		ctx.bezierCurveTo(
			cx + size * 0.5,
			cy,
			cx + size * 0.25,
			cy + size * 0.2,
			cx,
			cy + size * 0.42,
		);
		ctx.closePath();
		ctx.fill();
	} else if (suit === 'diamonds') {
		ctx.fillStyle = fill;
		ctx.beginPath();
		ctx.moveTo(cx, cy - size * 0.45);
		ctx.lineTo(cx + size * 0.38, cy);
		ctx.lineTo(cx, cy + size * 0.45);
		ctx.lineTo(cx - size * 0.38, cy);
		ctx.closePath();
		ctx.fill();
	} else if (suit === 'spades') {
		ctx.fillStyle = fill;
		ctx.beginPath();
		ctx.moveTo(cx, cy - size * 0.46);
		ctx.bezierCurveTo(
			cx + size * 0.15,
			cy - size * 0.25,
			cx + size * 0.48,
			cy - size * 0.05,
			cx + size * 0.48,
			cy + size * 0.18,
		);
		ctx.bezierCurveTo(
			cx + size * 0.48,
			cy + size * 0.36,
			cx + size * 0.26,
			cy + size * 0.4,
			cx + size * 0.05,
			cy + size * 0.22,
		);
		ctx.lineTo(cx + size * 0.16, cy + size * 0.46);
		ctx.lineTo(cx - size * 0.16, cy + size * 0.46);
		ctx.lineTo(cx - size * 0.05, cy + size * 0.22);
		ctx.bezierCurveTo(
			cx - size * 0.26,
			cy + size * 0.4,
			cx - size * 0.48,
			cy + size * 0.36,
			cx - size * 0.48,
			cy + size * 0.18,
		);
		ctx.bezierCurveTo(
			cx - size * 0.48,
			cy - size * 0.05,
			cx - size * 0.15,
			cy - size * 0.25,
			cx,
			cy - size * 0.46,
		);
		ctx.closePath();
		ctx.fill();
	} else if (suit === 'clubs') {
		ctx.fillStyle = fill;
		const r = size * 0.22;

		// Lobes
		ctx.beginPath();
		ctx.arc(cx, cy - size * 0.18, r, 0, Math.PI * 2);
		ctx.arc(cx - size * 0.2, cy + size * 0.06, r, 0, Math.PI * 2);
		ctx.arc(cx + size * 0.2, cy + size * 0.06, r, 0, Math.PI * 2);
		ctx.fill();

		// Base Stem
		ctx.beginPath();
		ctx.moveTo(cx - size * 0.04, cy);
		ctx.lineTo(cx + size * 0.16, cy + size * 0.46);
		ctx.lineTo(cx - size * 0.16, cy + size * 0.46);
		ctx.lineTo(cx + size * 0.04, cy);
		ctx.closePath();
		ctx.fill();
	}

	ctx.restore();
}

function drawRoundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

export function drawCard(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	card?: Card,
	highlight = false,
): void {
	ctx.save();

	const cornerRadius = Math.min(width, height) * 0.12;

	// Drop shadow
	ctx.shadowColor = highlight ? 'rgba(234, 179, 8, 0.6)' : 'rgba(0, 0, 0, 0.4)';
	ctx.shadowBlur = highlight ? 12 : 6;
	ctx.shadowOffsetY = 3;

	// Background Chassis
	drawRoundedRect(ctx, x, y, width, height, cornerRadius);

	if (!card || card.hidden) {
		// Face-down pattern
		ctx.fillStyle = '#1e293b';
		ctx.fill();

		ctx.shadowColor = 'transparent';
		ctx.strokeStyle = '#fbbf24';
		ctx.lineWidth = 1.5;
		drawRoundedRect(ctx, x + 3, y + 3, width - 6, height - 6, cornerRadius - 2);
		ctx.stroke();

		// Inner Diamond Grid Pattern
		ctx.save();
		ctx.clip();
		ctx.strokeStyle = 'rgba(59, 130, 246, 0.25)';
		ctx.lineWidth = 1;
		const step = 8;
		for (let i = -height; i < width + height; i += step) {
			ctx.beginPath();
			ctx.moveTo(x + i, y);
			ctx.lineTo(x + i + height, y + height);
			ctx.stroke();

			ctx.beginPath();
			ctx.moveTo(x + i, y + height);
			ctx.lineTo(x + i + height, y);
			ctx.stroke();
		}
		ctx.restore();

		ctx.restore();
		return;
	}

	// Face-up Card Background
	ctx.fillStyle = '#ffffff';
	ctx.fill();

	// Border Stroke
	ctx.shadowColor = 'transparent';
	ctx.strokeStyle = highlight ? '#eab308' : '#cbd5e1';
	ctx.lineWidth = highlight ? 2.5 : 1;
	drawRoundedRect(ctx, x, y, width, height, cornerRadius);
	ctx.stroke();

	const rankStr = RANK_LABELS[card.rank];
	const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
	const textColor = isRed ? '#ef4444' : '#0f172a';

	const fontSize = Math.max(10, Math.floor(height * 0.2));
	const suitSize = Math.max(6, Math.floor(fontSize * 0.5));
	ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
	ctx.fillStyle = textColor;

	const paddingX = Math.max(3, width * 0.08);
	const paddingY = Math.max(3, height * 0.06);

	const rankWidth = ctx.measureText(rankStr).width;
	const cornerCenterXOffset = paddingX + Math.max(rankWidth, suitSize) / 2;

	// 1. Top-Left Corner: Rank on top, Mini Suit below
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';

	const cornerCenterX = x + cornerCenterXOffset;
	ctx.fillText(rankStr, cornerCenterX, y + paddingY);

	const suitY = y + paddingY + fontSize * 0.88 + suitSize * 0.55;
	drawSuitSymbol(ctx, card.suit, cornerCenterX, suitY, suitSize, textColor);

	// 2. Bottom-Right Corner: Inverted Rank & Mini Suit
	ctx.save();
	ctx.translate(x + width / 2, y + height / 2);
	ctx.rotate(Math.PI);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	ctx.fillStyle = textColor;
	ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;

	const invX = -(width / 2 - cornerCenterXOffset);
	const invY = -(height / 2 - paddingY);

	ctx.fillText(rankStr, invX, invY);
	drawSuitSymbol(
		ctx,
		card.suit,
		invX,
		invY + fontSize * 0.88 + suitSize * 0.55,
		suitSize,
		textColor,
	);
	ctx.restore();

	// 3. Center Suit Symbol (Main Center Emblem for ALL Cards)
	const centerX = x + width / 2;
	const centerY = y + height / 2;

	let centerSuitSize = Math.max(14, width * 0.38);

	if (card.rank === 14) {
		// Ace: Ace Large Emblem
		centerSuitSize = Math.max(18, width * 0.46);
		drawSuitSymbol(ctx, card.suit, centerX, centerY, centerSuitSize, textColor);
	} else if (card.rank >= 11) {
		// Face cards (J, Q, K): Draw center suit symbol with subtle frame ring
		drawSuitSymbol(ctx, card.suit, centerX, centerY, centerSuitSize, textColor);

		ctx.save();
		ctx.strokeStyle = isRed
			? 'rgba(239, 68, 68, 0.3)'
			: 'rgba(15, 23, 42, 0.3)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.arc(centerX, centerY, centerSuitSize * 0.7, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	} else {
		// Number cards (2-10): Draw center suit symbol
		drawSuitSymbol(ctx, card.suit, centerX, centerY, centerSuitSize, textColor);
	}

	ctx.restore();
}
