// ── Shared types for Merge Mayhem ────────────────────────────────────────────

/** A cell offset relative to a piece's anchor (col 0, row 0) */
export interface TileOffset { dc: number; dr: number; }

/** Named polyomino shapes */
export type ShapeId = '1x1' | '1x2h' | '1x2v' | 'Lne' | 'Lnw' | 'Lse' | 'Lsw' | '2x2';

/** Shape definition: list of tile offsets from anchor */
export interface ShapeDef {
  id: ShapeId;
  tiles: TileOffset[];
  cols: number; // bounding box width
  rows: number; // bounding box height
}

/** All available shapes */
export const SHAPES: Record<ShapeId, ShapeDef> = {
  '1x1':  { id: '1x1',  tiles: [{dc:0,dr:0}],                                   cols:1, rows:1 },
  '1x2h': { id: '1x2h', tiles: [{dc:0,dr:0},{dc:1,dr:0}],                        cols:2, rows:1 },
  '1x2v': { id: '1x2v', tiles: [{dc:0,dr:0},{dc:0,dr:1}],                        cols:1, rows:2 },
  // L-shapes: anchor is always the corner cell
  'Lne':  { id: 'Lne',  tiles: [{dc:0,dr:0},{dc:1,dr:0},{dc:0,dr:1}],            cols:2, rows:2 },
  'Lnw':  { id: 'Lnw',  tiles: [{dc:0,dr:0},{dc:1,dr:0},{dc:1,dr:1}],            cols:2, rows:2 },
  'Lse':  { id: 'Lse',  tiles: [{dc:0,dr:0},{dc:0,dr:1},{dc:1,dr:1}],            cols:2, rows:2 },
  'Lsw':  { id: 'Lsw',  tiles: [{dc:1,dr:0},{dc:0,dr:1},{dc:1,dr:1}],            cols:2, rows:2 },
  '2x2':  { id: '2x2',  tiles: [{dc:0,dr:0},{dc:1,dr:0},{dc:0,dr:1},{dc:1,dr:1}],cols:2, rows:2 },
};

/** Tile count → possible shapes */
export const SHAPES_BY_SIZE: Record<number, ShapeId[]> = {
  1: ['1x1'],
  2: ['1x2h', '1x2v'],
  3: ['Lne', 'Lnw', 'Lse', 'Lsw'],
  4: ['2x2'],
};

/** A live piece on the board */
export interface Piece {
  id: number;
  shapeId: ShapeId;
  colorIndex: number;  // index into PIECE_COLORS
  stackValue: number;  // 1+
  col: number;         // anchor column (top-left of bounding box)
  row: number;         // anchor row
}

/** Slide direction */
export type Direction = 'left' | 'right' | 'up' | 'down';

/** Game phase */
export type GamePhase =
  | 'playing'
  | 'animating'   // a slide/merge is in progress
  | 'clearing'    // color-clear animation
  | 'stage-clear' // all pieces gone, transition
  | 'game-over';

/** Overall game state */
export interface GameState {
  phase: GamePhase;
  stage: number;
  score: number;
  pieces: Piece[];
  nextPieceId: number;
  colorsInPlay: number;       // how many distinct colors start this stage
  clearedColors: number[];    // color indices that have been cleared this stage
}
