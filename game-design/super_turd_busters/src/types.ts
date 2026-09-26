export type Direction = 'up' | 'down' | 'left' | 'right';
export type CellType = 'empty' | 'wall' | 'snake' | 'poop' | 'toilet';

export interface Cell {
  row: number;
  col: number;
}

export interface Level {
  grid: CellType[][];    // rows x cols
  cols: number;
  rows: number;
  toiletCol: number;     // column where snake starts (row 0)
  poopCells: Cell[];     // ordered list of poop targets
  solution: Direction[]; // guaranteed solution moves from bfsSolve
}

export interface GameState {
  level: number;
  snake: Cell[];            // index 0 = head
  direction: Direction;
  grid: CellType[][];
  cols: number;
  rows: number;
  toiletCol: number;
  poopCells: Cell[];        // all poop positions for this level
  clearedPoopKeys: string[]; // "row,col" strings for each poop already cleared
  moving: boolean;
  won: boolean;
  lost: boolean;
}
