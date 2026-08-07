export const BOARD_WIDTH = 10;
export const BOARD_HIDDEN_HEIGHT = 4;
export const BOARD_VISIBLE_HEIGHT = 20;
export const BOARD_INTERNAL_HEIGHT = 24;
export const BOARD_CELL_COUNT = BOARD_WIDTH * BOARD_INTERNAL_HEIGHT;

export const GARBAGE_CELL_VALUE = 8 as const;
export const GARBAGE_ACTIVATION_TICKS = 30;

export const SNAPSHOT_CELL_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export const PIECE_KINDS = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'] as const;
export const NEXT_PREVIEW_COUNT = 5;
