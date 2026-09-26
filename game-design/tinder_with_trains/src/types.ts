export interface Entity {
  spriteKey: string;
  name: string;
  karma: number; // positive = good, negative = evil
}

export interface Scenario {
  left: Entity[];
  right: Entity[];
}

export type SwitchDir = 'left' | 'right';

export type GamePhase =
  | 'choosing'   // player can flip switch
  | 'animating'  // train is moving
  | 'result'     // show outcome briefly
  | 'gameover';  // final screen

export interface GameState {
  alignment: number;
  phase: GamePhase;
  switchDir: SwitchDir;
  round: number;
  scenario: Scenario | null;
}
