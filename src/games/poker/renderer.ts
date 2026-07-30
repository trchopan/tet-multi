import type { RoomSnapshot } from '../../shared/types';
import type { RectBounds } from '../types';
import { drawCard } from './card-graphics';
import { evaluateHand } from './evaluator';
import type { PokerGameState, PokerPlayerState } from './types';

export const renderPokerSharedView = (
	ctx: CanvasRenderingContext2D,
	room: RoomSnapshot,
	bounds: RectBounds,
): void => {
	const gameState = room.customGameState as PokerGameState | undefined;
	ctx.clearRect(0, 0, bounds.width, bounds.height);

	// Canvas Background
	ctx.fillStyle = '#090d16';
	ctx.fillRect(0, 0, bounds.width, bounds.height);

	if (!gameState) {
		ctx.fillStyle = '#94a3b8';
		ctx.font = '16px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(
			"Waiting for Texas Hold'em match to start...",
			bounds.width / 2,
			bounds.height / 2,
		);
		return;
	}

	const w = bounds.width;
	const h = bounds.height;
	const centerX = w / 2;
	const centerY = h * 0.45;

	// Table Dimensions
	const tableW = w * 0.84;
	const tableH = h * 0.58;
	const tableR = Math.min(tableW, tableH) * 0.45;

	// Identify Active Player & Local Player
	const activeTurnSeat = gameState.currentTurnSeatIndex;
	const activePlayer = gameState.players[activeTurnSeat];
	// Local player is the seat with unhidden hole cards
	const localPlayer = gameState.players.find(
		(p) => p.holeCards.length > 0 && !p.holeCards[0]?.hidden,
	);
	const isMyTurn =
		localPlayer !== undefined &&
		gameState.stage !== 'showdown' &&
		gameState.stage !== 'hand_ended' &&
		gameState.players[activeTurnSeat]?.playerId === localPlayer.playerId;

	// 1. Draw Wooden Trim
	ctx.save();
	ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
	ctx.shadowBlur = 24;
	ctx.shadowOffsetY = 12;

	ctx.fillStyle = '#451a03'; // Mahogany
	ctx.beginPath();
	ctx.roundRect(
		centerX - tableW / 2 - 16,
		centerY - tableH / 2 - 16,
		tableW + 32,
		tableH + 32,
		tableR + 16,
	);
	ctx.fill();
	ctx.restore();

	// 2. Draw Felt Table Surface
	const feltGradient = ctx.createRadialGradient(
		centerX,
		centerY,
		10,
		centerX,
		centerY,
		tableW / 2,
	);
	feltGradient.addColorStop(0, '#16a34a');
	feltGradient.addColorStop(1, '#14532d');

	ctx.fillStyle = feltGradient;
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.roundRect(
		centerX - tableW / 2,
		centerY - tableH / 2,
		tableW,
		tableH,
		tableR,
	);
	ctx.fill();
	ctx.stroke();

	// Inner Felt Rail Line
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.roundRect(
		centerX - tableW / 2 + 18,
		centerY - tableH / 2 + 18,
		tableW - 36,
		tableH - 36,
		tableR - 18,
	);
	ctx.stroke();

	// 3. Stage Title Banner
	renderStageHeader(ctx, gameState, centerX, centerY - tableH / 2 + 35);

	// 4. Draw Pot & Community Cards in Table Center
	const cardW = Math.max(36, Math.floor(w * 0.055));
	const cardH = Math.floor(cardW * 1.4);

	// Pot Banner
	ctx.save();
	ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
	ctx.strokeStyle = '#fbbf24';
	ctx.lineWidth = 1.5;
	const potW = 160;
	const potH = 34;
	ctx.beginPath();
	ctx.roundRect(centerX - potW / 2, centerY - cardH - 30, potW, potH, 17);
	ctx.fill();
	ctx.stroke();

	// Gold Chip Icon
	ctx.fillStyle = '#fbbf24';
	ctx.beginPath();
	ctx.arc(centerX - potW / 2 + 20, centerY - cardH - 13, 10, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#78350f';
	ctx.font = 'bold 11px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('$', centerX - potW / 2 + 20, centerY - cardH - 13);

	// Pot Text
	ctx.fillStyle = '#f8fafc';
	ctx.font = 'bold 14px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(`POT: $${gameState.pot}`, centerX + 10, centerY - cardH - 13);
	ctx.restore();

	// Community Cards Slots (5 slots)
	const commGap = 8;
	const totalCommW = 5 * cardW + 4 * commGap;
	const commStartX = centerX - totalCommW / 2;
	const commY = centerY - cardH / 2 + 5;

	for (let i = 0; i < 5; i++) {
		const cardX = commStartX + i * (cardW + commGap);
		const commCard = gameState.communityCards[i];

		if (commCard) {
			drawCard(ctx, cardX, commY, cardW, cardH, commCard, false);
		} else {
			// Empty card slot placeholder
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.roundRect(cardX, commY, cardW, cardH, 6);
			ctx.stroke();
		}
	}

	// 5. Render Player Seats (Symmetrical Layout around Table)
	const seats = gameState.players;
	const totalSeats = seats.length;

	let localPlayerHandEvalLabel: string | undefined;
	if (
		localPlayer &&
		localPlayer.holeCards.length >= 2 &&
		!localPlayer.holeCards[0]?.hidden &&
		gameState.communityCards.length >= 3
	) {
		try {
			const handEval = evaluateHand([
				...localPlayer.holeCards,
				...gameState.communityCards,
			]);
			localPlayerHandEvalLabel = handEval.label;
		} catch {
			// Ignore if hand evaluation is not possible
		}
	}

	for (let seatIdx = 0; seatIdx < totalSeats; seatIdx++) {
		const player = seats[seatIdx]!;

		// Compute seat position along oval perimeter
		// Seat 0 at bottom center (local player default seat)
		const angle = Math.PI / 2 + seatIdx * ((2 * Math.PI) / totalSeats);
		const rx = tableW * 0.48;
		const ry = tableH * 0.48;

		const seatX = centerX + rx * Math.cos(angle);
		const seatY = centerY + ry * Math.sin(angle);

		const isCurrentTurn =
			gameState.stage !== 'showdown' &&
			gameState.stage !== 'hand_ended' &&
			seatIdx === gameState.currentTurnSeatIndex;

		const isDealer = seatIdx === gameState.dealerSeatIndex;
		const isSB = seatIdx === gameState.smallBlindSeatIndex;
		const isBB = seatIdx === gameState.bigBlindSeatIndex;

		const isLocalPlayer =
			localPlayer !== undefined && player.playerId === localPlayer.playerId;
		const handEvalLabel = isLocalPlayer ? localPlayerHandEvalLabel : undefined;

		renderPlayerSeat(
			ctx,
			player,
			seatX,
			seatY,
			cardW,
			cardH,
			isCurrentTurn,
			isDealer,
			isSB,
			isBB,
			gameState.winningPlayerIds.includes(player.playerId),
			gameState.turnTimeRemainingTicks,
			gameState.maxTurnTimeTicks ?? 900,
			handEvalLabel,
		);
	}

	// 6. Draw Game Event Log Feed (Top-Left area)
	renderActionLogFeed(ctx, gameState.actionLog ?? []);

	// 7. Draw Turn Notification Prompt Banner
	renderTurnPromptHeader(ctx, isMyTurn, activePlayer, gameState.stage, w, h);

	// 8. Draw Controller Action HUD Banner at Bottom
	renderControlHUD(ctx, gameState, localPlayer, activePlayer, isMyTurn, w, h);
};

function renderStageHeader(
	ctx: CanvasRenderingContext2D,
	gameState: PokerGameState,
	centerX: number,
	topY: number,
): void {
	ctx.save();

	// Stage Badge
	const stageText = gameState.stage.toUpperCase().replace('_', ' ');
	ctx.font = 'bold 12px system-ui, sans-serif';
	const stageWidth = ctx.measureText(stageText).width + 24;

	ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.roundRect(centerX - stageWidth / 2, topY, stageWidth, 24, 12);
	ctx.fill();
	ctx.stroke();

	ctx.fillStyle = '#fbbf24';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(stageText, centerX, topY + 12);

	ctx.restore();
}

function renderPlayerSeat(
	ctx: CanvasRenderingContext2D,
	player: PokerPlayerState,
	x: number,
	y: number,
	cardW: number,
	cardH: number,
	isTurn: boolean,
	isDealer: boolean,
	isSB: boolean,
	isBB: boolean,
	isWinner: boolean,
	remainingTicks: number,
	maxTicks: number,
	handEvalLabel?: string | undefined,
): void {
	ctx.save();

	const boxW = Math.max(160, cardW * 3.6);
	const boxH = Math.max(84, cardH * 1.55);
	const boxX = x - boxW / 2;
	const boxY = y - boxH / 2;

	// Calculate Hole Cards position & max available text width
	const cardsX = boxX + boxW - cardW * 1.75 - 8;
	const cardsY = boxY + (boxH - cardH) / 2;
	const maxTextW = cardsX - boxX - 16;

	// Local Player Best Hand Strength Pill (Floating above local player seat box)
	if (handEvalLabel) {
		const handStr = `Your Hand: ${handEvalLabel}`;
		ctx.font = 'bold 11px system-ui, sans-serif';
		const badgeW = ctx.measureText(handStr).width + 24;
		const badgeH = 22;
		const badgeX = x - badgeW / 2;
		const badgeY = boxY - badgeH - 5;

		ctx.shadowColor = 'rgba(56, 189, 248, 0.4)';
		ctx.shadowBlur = 8;
		ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
		ctx.strokeStyle = '#38bdf8';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 11);
		ctx.fill();
		ctx.stroke();

		ctx.shadowColor = 'transparent';
		ctx.fillStyle = '#38bdf8';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(handStr, x, badgeY + badgeH / 2);
	}

	// Active Turn Highlight Glow
	if (isTurn) {
		ctx.shadowColor = '#38bdf8';
		ctx.shadowBlur = 18;
		ctx.strokeStyle = '#38bdf8';
		ctx.lineWidth = 2.5;
	} else if (isWinner) {
		ctx.shadowColor = '#eab308';
		ctx.shadowBlur = 20;
		ctx.strokeStyle = '#eab308';
		ctx.lineWidth = 3;
	} else {
		ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
		ctx.shadowBlur = 8;
		ctx.strokeStyle = player.folded
			? 'rgba(255, 255, 255, 0.1)'
			: 'rgba(255, 255, 255, 0.2)';
		ctx.lineWidth = 1;
	}

	// Seat Box Background
	ctx.fillStyle = player.folded
		? 'rgba(15, 23, 42, 0.6)'
		: 'rgba(15, 23, 42, 0.92)';
	ctx.beginPath();
	ctx.roundRect(boxX, boxY, boxW, boxH, 12);
	ctx.fill();
	ctx.stroke();

	// Active Turn Timer Progress Bar at Bottom of Box
	if (isTurn && remainingTicks > 0) {
		const timerPct = Math.max(0, Math.min(1, remainingTicks / maxTicks));
		const barColor =
			timerPct > 0.5 ? '#22c55e' : timerPct > 0.25 ? '#eab308' : '#ef4444';

		ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
		ctx.beginPath();
		ctx.roundRect(boxX + 4, boxY + boxH - 6, boxW - 8, 4, 2);
		ctx.fill();

		ctx.fillStyle = barColor;
		ctx.beginPath();
		ctx.roundRect(boxX + 4, boxY + boxH - 6, (boxW - 8) * timerPct, 4, 2);
		ctx.fill();
	}

	// Player Name & Turn Timer Badge
	ctx.shadowColor = 'transparent';
	ctx.fillStyle = player.folded ? '#64748b' : '#f8fafc';
	ctx.font = 'bold 13px system-ui, sans-serif';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';

	const nameStr =
		player.displayName.length > 11
			? player.displayName.slice(0, 10) + '…'
			: player.displayName;
	ctx.fillText(nameStr, boxX + 10, boxY + 8);

	// Display Timer Seconds Badge if Turn
	if (isTurn) {
		const secs = Math.ceil(remainingTicks / 60);
		ctx.fillStyle = secs <= 3 ? '#ef4444' : secs <= 5 ? '#eab308' : '#38bdf8';
		ctx.font = 'bold 11px system-ui, sans-serif';
		ctx.textAlign = 'right';
		ctx.fillText(`⏱ ${secs}s`, boxX + boxW - 10, boxY + 8);
	}

	// Chips
	ctx.shadowColor = 'transparent';
	ctx.textAlign = 'left';
	ctx.fillStyle = player.chips > 0 ? '#fbbf24' : '#ef4444';
	ctx.font = 'bold 12px system-ui, sans-serif';
	ctx.fillText(`$${player.chips}`, boxX + 10, boxY + 25);

	// Last Action Pill / Hand Result
	if (player.lastAction || player.handResult || (isTurn && player.isComputer)) {
		let actionStr = player.handResult ?? player.lastAction ?? '';
		let isThinking = false;
		if (isTurn && player.isComputer && !player.handResult) {
			actionStr = 'THINKING...';
			isThinking = true;
		}

		// Normalize / format action string for clean compact display
		actionStr = actionStr.replace(/^RAISE TO /i, 'RAISE $');
		actionStr = actionStr.replace(/^CALL /i, 'CALL $');
		actionStr = actionStr.replace(/^SB /i, 'SB $');
		actionStr = actionStr.replace(/^BB /i, 'BB $');

		let displayStr = actionStr.toUpperCase();

		ctx.font = 'bold 10px system-ui, sans-serif';
		if (ctx.measureText(displayStr).width > maxTextW) {
			ctx.font = 'bold 9px system-ui, sans-serif';
		}
		if (ctx.measureText(displayStr).width > maxTextW) {
			while (
				displayStr.length > 3 &&
				ctx.measureText(displayStr + '…').width > maxTextW
			) {
				displayStr = displayStr.slice(0, -1);
			}
			displayStr += '…';
		}

		const textColor = isWinner
			? '#eab308'
			: player.folded
				? '#94a3b8'
				: isThinking
					? '#f59e0b'
					: '#38bdf8';

		const textW = ctx.measureText(displayStr).width;
		const pillW = Math.min(maxTextW, textW + 8);
		const pillH = 16;
		const pillX = boxX + 8;
		const pillY = boxY + 43;

		const bgColor = isWinner
			? 'rgba(234, 179, 8, 0.18)'
			: player.folded
				? 'rgba(148, 163, 184, 0.12)'
				: isThinking
					? 'rgba(245, 158, 11, 0.18)'
					: 'rgba(56, 189, 248, 0.15)';

		ctx.fillStyle = bgColor;
		ctx.beginPath();
		ctx.roundRect(pillX, pillY, pillW, pillH, 4);
		ctx.fill();

		ctx.fillStyle = textColor;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.fillText(displayStr, pillX + 4, pillY + pillH / 2);
	}

	// Draw Hole Cards (2 cards on right side of seat box)
	if (player.holeCards.length >= 2) {
		const c1 = player.holeCards[0]!;
		const c2 = player.holeCards[1]!;
		drawCard(ctx, cardsX, cardsY, cardW, cardH, c1, isWinner);
		drawCard(ctx, cardsX + cardW * 0.65, cardsY, cardW, cardH, c2, isWinner);
	}

	// Dealer / SB / BB Badges
	const badgeR = 10;
	let badgeX = boxX - badgeR;
	const badgeY = boxY + boxH / 2;

	if (isDealer) {
		ctx.fillStyle = '#fbbf24';
		ctx.beginPath();
		ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#78350f';
		ctx.font = 'bold 10px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('D', badgeX, badgeY);
		badgeX -= badgeR * 2 + 4;
	}

	if (isSB) {
		ctx.fillStyle = '#38bdf8';
		ctx.beginPath();
		ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#0f172a';
		ctx.font = 'bold 9px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('SB', badgeX, badgeY);
	} else if (isBB) {
		ctx.fillStyle = '#c084fc';
		ctx.beginPath();
		ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#0f172a';
		ctx.font = 'bold 9px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('BB', badgeX, badgeY);
	}

	ctx.restore();
}

function renderActionLogFeed(
	ctx: CanvasRenderingContext2D,
	logEntries: readonly string[],
): void {
	if (logEntries.length === 0) return;

	ctx.save();
	const boxX = 14;
	const boxY = 14;
	const boxW = 230;
	const maxLines = Math.min(5, logEntries.length);
	const boxH = 24 + maxLines * 16;

	ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.roundRect(boxX, boxY, boxW, boxH, 10);
	ctx.fill();
	ctx.stroke();

	// Title
	ctx.fillStyle = '#fbbf24';
	ctx.font = 'bold 11px system-ui, sans-serif';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
	ctx.fillText('📋 GAME LOG', boxX + 10, boxY + 8);

	// Log lines (most recent at bottom)
	const recent = logEntries.slice(-maxLines);
	ctx.font = '11px system-ui, sans-serif';
	ctx.fillStyle = '#cbd5e1';

	for (let i = 0; i < recent.length; i++) {
		const line = recent[i]!;
		const truncated = line.length > 32 ? line.slice(0, 31) + '…' : line;
		ctx.fillText(`• ${truncated}`, boxX + 10, boxY + 24 + i * 16);
	}

	ctx.restore();
}

function renderTurnPromptHeader(
	ctx: CanvasRenderingContext2D,
	isMyTurn: boolean,
	activePlayer: PokerPlayerState | undefined,
	stage: string,
	w: number,
	h: number,
): void {
	if (stage === 'showdown' || stage === 'hand_ended' || !activePlayer) return;

	ctx.save();
	const bannerY = h - 72;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	if (isMyTurn) {
		ctx.font = 'bold 14px system-ui, sans-serif';
		ctx.fillStyle = '#fbbf24';
		ctx.shadowColor = '#fbbf24';
		ctx.shadowBlur = 10;
		ctx.fillText('★ YOUR TURN TO ACT ★', w / 2, bannerY);
	} else {
		ctx.font = '13px system-ui, sans-serif';
		ctx.fillStyle = '#94a3b8';
		ctx.shadowColor = 'transparent';
		const statusSuffix = activePlayer.isComputer ? ' (thinking)…' : '…';
		ctx.fillText(
			`Waiting for ${activePlayer.displayName}${statusSuffix}`,
			w / 2,
			bannerY,
		);
	}

	ctx.restore();
}

function renderControlHUD(
	ctx: CanvasRenderingContext2D,
	gameState: PokerGameState,
	localPlayer: PokerPlayerState | undefined,
	activePlayer: PokerPlayerState | undefined,
	isMyTurn: boolean,
	w: number,
	h: number,
): void {
	ctx.save();

	const hudW = Math.min(w * 0.94, 760);
	const hudH = 48;
	const hudX = (w - hudW) / 2;
	const hudY = h - hudH - 10;

	// Background container
	ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
	ctx.strokeStyle = isMyTurn
		? 'rgba(56, 189, 248, 0.5)'
		: 'rgba(255, 255, 255, 0.12)';
	ctx.lineWidth = isMyTurn ? 1.5 : 1;
	ctx.beginPath();
	ctx.roundRect(hudX, hudY, hudW, hudH, 14);
	ctx.fill();
	ctx.stroke();

	// Calculate specific action values for local player
	const currentP = isMyTurn && localPlayer ? localPlayer : activePlayer;
	const callCost = currentP
		? Math.max(0, gameState.highestBet - currentP.currentBet)
		: 0;
	const checkOrCallLabel = callCost === 0 ? 'CHECK' : `CALL $${callCost}`;
	const raiseLabel = `RAISE $${currentP?.pendingBet ?? gameState.highestBet + gameState.minRaise}`;
	const allInAmt = currentP ? currentP.chips : 0;

	// Controls list with buttons
	const controls = [
		{ key: '[A]', label: checkOrCallLabel, color: '#22c55e' },
		{ key: '[B]', label: 'FOLD', color: '#ef4444' },
		{ key: '[X]', label: raiseLabel, color: '#38bdf8' },
		{ key: '[Y]', label: `ALL-IN ($${allInAmt})`, color: '#a855f7' },
		{ key: '[▲/▼]', label: 'CHANGE BET', color: '#fbbf24' },
	];

	const itemW = hudW / controls.length;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	if (!isMyTurn) {
		ctx.globalAlpha = 0.55;
	}

	for (let i = 0; i < controls.length; i++) {
		const ctrl = controls[i]!;
		const bx = hudX + i * itemW + 4;
		const by = hudY + 4;
		const bw = itemW - 8;
		const bh = hudH - 8;

		// Button background outline box
		ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
		ctx.strokeStyle = ctrl.color;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.roundRect(bx, by, bw, bh, 8);
		ctx.fill();
		ctx.stroke();

		const cx = bx + bw / 2;
		const cy = by + bh / 2;

		ctx.fillStyle = ctrl.color;
		ctx.font = 'bold 11px system-ui, sans-serif';
		ctx.fillText(`${ctrl.key} ${ctrl.label}`, cx, cy);
	}

	ctx.restore();
}
