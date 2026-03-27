/** Mirror of server-side PlayerSnapshot record */
export interface PlayerSnapshot {
  id:           string;
  name:         string;
  colorIdx:     number;
  x:            number;
  y:            number;
  state:        string;      // IDLE | WALK | JUMP | PUNCH
  direction:    string;      // north | south | east | west
  isIt:         boolean;
  itDuration:   number;      // seconds accumulated as IT
  immuneUntil:  number;      // Unix-ms client can use for visual immunity flash
}

// ── Server → Client event payloads ────────────────────────────────────────────

export interface JoinedPayload {
  playerId:  string;
  colorIdx:  number;
}

export interface LobbyUpdatedPayload {
  players:  PlayerSnapshot[];
  canStart: boolean;
}

export interface GameStartedPayload {
  players:          PlayerSnapshot[];
  itId:             string;
  remainingSeconds: number;
  arenaId:          string;
  currentRound:     number;
  totalRounds:      number;
}

export interface StateUpdatedPayload {
  players: PlayerSnapshot[];
}

export interface TaggedPayload {
  newItId: string;
  oldItId: string;
}

export interface TimeTickPayload {
  remainingSeconds: number;
}

export interface GameEndedPayload {
  leaderboard: PlayerSnapshot[];
}

export interface RoundEndedPayload {
  leaderboard:  PlayerSnapshot[];
  currentRound: number;
  totalRounds:  number;
}

export interface ErrorPayload {
  message: string;
}

// ── App-level game state ───────────────────────────────────────────────────────

export type GamePhase = 'LOBBY' | 'PLAYING' | 'ENDED';

export interface GameState {
  phase:            GamePhase;
  myId:             string | null;
  myColorIdx:       number;
  players:          PlayerSnapshot[];
  canStart:         boolean;
  remainingSeconds: number;
  itId:             string | null;
  leaderboard:      PlayerSnapshot[];
  errorMessage:     string | null;
  joinRejectedCode?: string | null;
  arenaId:          string;
  currentRound:     number;
  totalRounds:      number;
}
