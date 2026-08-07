import type { RoomSnapshot } from '../../../shared/types';
import type { RectBounds } from '../../types';
import { drawCard } from './card-graphics';
import { evaluateHand } from '../domain/evaluator';
import type { PokerGameState, PokerPlayerState } from '../types';

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

	// Identify Active Player & Local Player
	const activeTurnSeat = gameState.currentTurnSeatIndex;
	const activePlayer = gameState.players[activeTurnSeat];
	const localPlayer = gameState.players.find(
		(p) => p.holeCards.length > 0 && !p.holeCards[0]?.hidden,
	);
	const isMyTurn =
		localPlayer !== undefined &&
		gameState.stage !== 'showdown' &&
		gameState.stage !== 'hand_ended' &&
		gameState.players[activeTurnSeat]?.playerId === localPlayer.playerId;

	const isMobile = w < 580 || h > w;

	if (isMobile) {
		renderMobilePokerView(
			ctx,
			gameState,
			bounds,
			localPlayer,
			activePlayer,
			isMyTurn,
		);
	} else {
		renderDesktopPokerView(
			ctx,
			gameState,
			bounds,
			localPlayer,
			activePlayer,
			isMyTurn,
		);
	}
};

function renderDesktopPokerView(
	ctx: CanvasRenderingContext2D,
	gameState: PokerGameState,
	bounds: RectBounds,
	localPlayer: PokerPlayerState | undefined,
	activePlayer: PokerPlayerState | undefined,
	isMyTurn: boolean,
): void {
	const w = bounds.width;
	const h = bounds.height;
	const centerX = w / 2;
	const centerY = h * 0.45;

	// Table Dimensions
	const tableW = w * 0.84;
	const tableH = h * 0.58;
	const tableR = Math.min(tableW, tableH) * 0.45;

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
	const cardW = Math.max(18, Math.min(50, Math.floor(w * 0.05)));
	const cardH = Math.floor(cardW * 1.4);

	// Pot Banner
	ctx.save();
	ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
	ctx.strokeStyle = '#fbbf24';
	ctx.lineWidth = 1.5;
	const potW = Math.max(110, Math.min(160, w * 0.25));
	const potH = Math.max(26, Math.min(34, h * 0.08));
	ctx.beginPath();
	ctx.roundRect(centerX - potW / 2, centerY - cardH - 24, potW, potH, 14);
	ctx.fill();
	ctx.stroke();

	// Gold Chip Icon
	ctx.fillStyle = '#fbbf24';
	ctx.beginPath();
	ctx.arc(
		centerX - potW / 2 + 16,
		centerY - cardH - 24 + potH / 2,
		8,
		0,
		Math.PI * 2,
	);
	ctx.fill();
	ctx.fillStyle = '#78350f';
	ctx.font = 'bold 9px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('$', centerX - potW / 2 + 16, centerY - cardH - 24 + potH / 2);

	// Pot Text
	ctx.fillStyle = '#f8fafc';
	ctx.font = `bold ${Math.max(10, Math.min(14, Math.floor(potH * 0.45)))}px system-ui, sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(
		`POT: $${gameState.pot}`,
		centerX + 8,
		centerY - cardH - 24 + potH / 2,
	);
	ctx.restore();

	// Community Cards Slots (5 slots)
	const commGap = Math.max(4, Math.floor(w * 0.01));
	const totalCommW = 5 * cardW + 4 * commGap;
	const commStartX = centerX - totalCommW / 2;
	const commY = centerY - cardH / 2 + 5;

	for (let i = 0; i < 5; i++) {
		const cardX = commStartX + i * (cardW + commGap);
		const commCard = gameState.communityCards[i];

		if (commCard) {
			drawCard(ctx, cardX, commY, cardW, cardH, commCard, false);
		} else {
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.roundRect(cardX, commY, cardW, cardH, 6);
			ctx.stroke();
		}
	}

	// 5. Render Player Seats
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

		const angle = Math.PI / 2 + seatIdx * ((2 * Math.PI) / totalSeats);
		const rx = tableW * 0.44;
		const ry = tableH * 0.44;

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

	// 6. Draw Game Event Log Feed
	if (w >= 520) {
		renderActionLogFeed(ctx, gameState.actionLog ?? []);
	}

	// 7. Draw Turn Notification Prompt Banner
	renderTurnPromptHeader(ctx, isMyTurn, activePlayer, gameState.stage, w, h);

	// 8. Draw Controller Action HUD Banner on Desktop
	if (w >= 750) {
		renderControlHUD(ctx, gameState, localPlayer, activePlayer, isMyTurn, w, h);
	}
}

function renderMobilePokerView(
	ctx: CanvasRenderingContext2D,
	gameState: PokerGameState,
	bounds: RectBounds,
	localPlayer: PokerPlayerState | undefined,
	activePlayer: PokerPlayerState | undefined,
	isMyTurn: boolean,
): void {
	const w = bounds.width;
	const h = bounds.height;
	const centerX = w / 2;

	// === TIER 1: [TABLE DEALING CARD] (Top Section) ===
	const topBoxW = w * 0.94;
	const topBoxH = Math.max(110, Math.floor(h * 0.28));
	const topBoxX = (w - topBoxW) / 2;
	const topBoxY = 8;

	// Outer Frame & Felt Container
	ctx.save();
	ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
	ctx.shadowBlur = 12;
	ctx.shadowOffsetY = 6;

	// Mahogany border frame
	ctx.fillStyle = '#451a03';
	ctx.beginPath();
	ctx.roundRect(topBoxX - 4, topBoxY - 4, topBoxW + 8, topBoxH + 8, 14);
	ctx.fill();
	ctx.restore();

	// Felt Radial Gradient
	const feltGrad = ctx.createRadialGradient(
		centerX,
		topBoxY + topBoxH / 2,
		10,
		centerX,
		topBoxY + topBoxH / 2,
		topBoxW / 2,
	);
	feltGrad.addColorStop(0, '#16a34a');
	feltGrad.addColorStop(1, '#14532d');

	ctx.fillStyle = feltGrad;
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.roundRect(topBoxX, topBoxY, topBoxW, topBoxH, 12);
	ctx.fill();
	ctx.stroke();

	// Inner Felt Trim
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.roundRect(topBoxX + 6, topBoxY + 6, topBoxW - 12, topBoxH - 12, 8);
	ctx.stroke();

	// 1A. Stage Title Banner
	renderStageHeader(ctx, gameState, centerX, topBoxY + 12);

	// 1B. Pot Banner
	ctx.save();
	ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
	ctx.strokeStyle = '#fbbf24';
	ctx.lineWidth = 1.5;
	const potW = Math.max(120, Math.floor(w * 0.36));
	const potH = 26;
	const potY = topBoxY + 40;
	ctx.beginPath();
	ctx.roundRect(centerX - potW / 2, potY, potW, potH, 13);
	ctx.fill();
	ctx.stroke();

	// Gold Chip Icon
	ctx.fillStyle = '#fbbf24';
	ctx.beginPath();
	ctx.arc(centerX - potW / 2 + 14, potY + potH / 2, 7, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#78350f';
	ctx.font = 'bold 9px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('$', centerX - potW / 2 + 14, potY + potH / 2);

	ctx.fillStyle = '#f8fafc';
	ctx.font = 'bold 12px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(`POT: $${gameState.pot}`, centerX + 6, potY + potH / 2);
	ctx.restore();

	// 1C. 5 Community Cards
	const cardW = Math.max(22, Math.min(36, Math.floor(w * 0.088)));
	const cardH = Math.floor(cardW * 1.4);
	const commGap = 5;
	const totalCommW = 5 * cardW + 4 * commGap;
	const commStartX = centerX - totalCommW / 2;
	const commY = topBoxY + topBoxH - cardH - 10;

	for (let i = 0; i < 5; i++) {
		const cardX = commStartX + i * (cardW + commGap);
		const commCard = gameState.communityCards[i];

		if (commCard) {
			drawCard(ctx, cardX, commY, cardW, cardH, commCard, false);
		} else {
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.roundRect(cardX, commY, cardW, cardH, 4);
			ctx.stroke();
		}
	}

	// === TIER 2: OPPONENT GRID (`[player 1] ... [player N]`) ===
	const gridStartY = topBoxY + topBoxH + 12;
	const opponents = gameState.players.filter(
		(p) => localPlayer === undefined || p.playerId !== localPlayer.playerId,
	);

	const isSingleOpponent = opponents.length === 1;
	const oppBoxW = isSingleOpponent
		? Math.floor(w * 0.94)
		: Math.floor((w * 0.94 - 10) / 2);
	const oppBoxH = 56;

	const col1X = w * 0.27;
	const col2X = w * 0.73;
	const row1Y = gridStartY + 32;
	const row2Y = gridStartY + 96;

	// Dynamic Opponent Placement based on count
	let oppCoords: Array<[number, number]> = [];
	if (opponents.length === 1) {
		oppCoords = [[centerX, row1Y]];
	} else if (opponents.length === 2) {
		oppCoords = [
			[col1X, row1Y],
			[col2X, row1Y],
		];
	} else if (opponents.length === 3) {
		oppCoords = [
			[col1X, row1Y],
			[col2X, row1Y],
			[centerX, row2Y],
		];
	} else {
		oppCoords = [
			[col1X, row1Y],
			[col2X, row1Y],
			[col1X, row2Y],
			[col2X, row2Y],
		];
	}

	for (let i = 0; i < Math.min(oppCoords.length, opponents.length); i++) {
		const opp = opponents[i]!;
		const coord = oppCoords[i]!;
		const seatIdx = gameState.players.findIndex(
			(p) => p.playerId === opp.playerId,
		);

		const isCurrentTurn =
			gameState.stage !== 'showdown' &&
			gameState.stage !== 'hand_ended' &&
			seatIdx === gameState.currentTurnSeatIndex;

		renderPlayerSeat(
			ctx,
			opp,
			coord[0],
			coord[1],
			cardW,
			cardH,
			isCurrentTurn,
			seatIdx === gameState.dealerSeatIndex,
			seatIdx === gameState.smallBlindSeatIndex,
			seatIdx === gameState.bigBlindSeatIndex,
			gameState.winningPlayerIds.includes(opp.playerId),
			gameState.turnTimeRemainingTicks,
			gameState.maxTurnTimeTicks ?? 900,
			undefined,
			oppBoxW,
			oppBoxH,
		);
	}

	// === TIER 3: [CURRENT PLAYER] (Full Width Hero Card at Bottom) ===
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
			// ignore
		}
	}

	const heroPlayer = localPlayer ?? gameState.players[0];
	if (heroPlayer) {
		const heroSeatIdx = gameState.players.findIndex(
			(p) => p.playerId === heroPlayer.playerId,
		);
		const isHeroTurn =
			gameState.stage !== 'showdown' &&
			gameState.stage !== 'hand_ended' &&
			heroSeatIdx === gameState.currentTurnSeatIndex;

		const heroY = gridStartY + (opponents.length > 2 ? 164 : 100);
		const heroBoxW = Math.floor(w * 0.94);
		const heroBoxH = 62;

		renderPlayerSeat(
			ctx,
			heroPlayer,
			centerX,
			heroY,
			Math.max(26, Math.floor(cardW * 1.1)),
			Math.max(36, Math.floor(cardH * 1.1)),
			isHeroTurn,
			heroSeatIdx === gameState.dealerSeatIndex,
			heroSeatIdx === gameState.smallBlindSeatIndex,
			heroSeatIdx === gameState.bigBlindSeatIndex,
			gameState.winningPlayerIds.includes(heroPlayer.playerId),
			gameState.turnTimeRemainingTicks,
			gameState.maxTurnTimeTicks ?? 900,
			localPlayerHandEvalLabel,
			heroBoxW,
			heroBoxH,
		);
	}

	// Turn Prompt Banner
	renderTurnPromptHeader(ctx, isMyTurn, activePlayer, gameState.stage, w, h);
}

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
	overrideBoxW?: number | undefined,
	overrideBoxH?: number | undefined,
): void {
	ctx.save();

	const boxW =
		overrideBoxW ??
		(handEvalLabel !== undefined
			? Math.min(cardW * 9, 310)
			: Math.max(90, Math.min(156, Math.floor(cardW * 3.4))));
	const boxH =
		overrideBoxH ??
		(handEvalLabel !== undefined
			? 60
			: Math.max(48, Math.min(78, Math.floor(cardH * 1.5))));
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

	const hasDealer = isDealer;
	const hasBlind = isSB || isBB;
	const textLeft = boxX + (hasDealer || hasBlind ? 23 : 8);

	// Player Name & Turn Timer Badge
	ctx.shadowColor = 'transparent';
	ctx.fillStyle = player.folded ? '#64748b' : '#f8fafc';
	ctx.font = 'bold 12px system-ui, sans-serif';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';

	const nameStr =
		player.displayName.length > 10
			? player.displayName.slice(0, 9) + '…'
			: player.displayName;
	ctx.fillText(nameStr, textLeft, boxY + 6);

	// Display Timer Seconds Badge if Turn
	if (isTurn) {
		const secs = Math.ceil(remainingTicks / 60);
		ctx.fillStyle = secs <= 3 ? '#ef4444' : secs <= 5 ? '#eab308' : '#38bdf8';
		ctx.font = 'bold 11px system-ui, sans-serif';
		ctx.textAlign = 'right';
		ctx.fillText(`⏱ ${secs}s`, boxX + boxW - 8, boxY + 6);
	}

	// Chips
	ctx.shadowColor = 'transparent';
	ctx.textAlign = 'left';
	ctx.fillStyle = player.chips > 0 ? '#fbbf24' : '#ef4444';
	ctx.font = 'bold 11px system-ui, sans-serif';
	ctx.fillText(`$${player.chips}`, textLeft, boxY + 22);

	// Last Action Pill / Hand Result
	if (player.lastAction || player.handResult || (isTurn && player.isComputer)) {
		let actionStr = player.handResult ?? player.lastAction ?? '';
		let isThinking = false;
		if (isTurn && player.isComputer && !player.handResult) {
			actionStr = 'THINKING...';
			isThinking = true;
		}

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
		const pillH = 15;
		const pillX = textLeft;
		const pillY = boxY + 37;

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

	// Dealer / SB / BB Badges (Inside top-left of seat box)
	const badgeR = 8;
	const badgeX = boxX + badgeR + 3;
	const badgeCenterY = boxY + boxH / 2;

	let dealerY = badgeCenterY;
	let blindY = badgeCenterY;

	if (hasDealer && hasBlind) {
		dealerY = badgeCenterY - badgeR - 2;
		blindY = badgeCenterY + badgeR + 2;
	}

	if (isDealer) {
		ctx.fillStyle = '#fbbf24';
		ctx.beginPath();
		ctx.arc(badgeX, dealerY, badgeR, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#78350f';
		ctx.font = 'bold 9px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('D', badgeX, dealerY);
	}

	if (isSB) {
		ctx.fillStyle = '#38bdf8';
		ctx.beginPath();
		ctx.arc(badgeX, blindY, badgeR, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#0f172a';
		ctx.font = 'bold 8px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('SB', badgeX, blindY);
	} else if (isBB) {
		ctx.fillStyle = '#c084fc';
		ctx.beginPath();
		ctx.arc(badgeX, blindY, badgeR, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#0f172a';
		ctx.font = 'bold 8px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('BB', badgeX, blindY);
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
		{ key: '[A] a', label: checkOrCallLabel, color: '#22c55e' },
		{ key: '[B] s', label: 'FOLD', color: '#ef4444' },
		{ key: '[X] z', label: raiseLabel, color: '#38bdf8' },
		{ key: '[Y] c', label: `ALL-IN ($${allInAmt})`, color: '#a855f7' },
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
