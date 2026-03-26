import type {
  GameState,
  JoinedPayload,
  LobbyUpdatedPayload,
  GameStartedPayload,
  StateUpdatedPayload,
  TaggedPayload,
  TimeTickPayload,
  GameEndedPayload,
  RoundEndedPayload,
} from '@/types/game';

// ── Action types ──────────────────────────────────────────────────────────────

export type GameAction =
  | { type: 'JOINED';         payload: JoinedPayload          }
  | { type: 'LOBBY_UPDATED';  payload: LobbyUpdatedPayload    }
  | { type: 'GAME_STARTED';   payload: GameStartedPayload    }
  | { type: 'STATE_UPDATED';  payload: StateUpdatedPayload   }
  | { type: 'TAGGED';         payload: TaggedPayload          }
  | { type: 'TIME_TICK';      payload: TimeTickPayload        }
  | { type: 'GAME_ENDED';     payload: GameEndedPayload      }
  | { type: 'ROUND_ENDED';    payload: RoundEndedPayload     }
  | { type: 'ERROR';          payload: { message: string }   }
  | { type: 'CLEAR_ERROR'                                     }
  | { type: 'RESET_TO_LOBBY'                                  };

// ── Initial state ─────────────────────────────────────────────────────────────

export const initialGameState: GameState = {
  phase:            'LOBBY',
  myId:             null,
  myColorIdx:       0,
  players:          [],
  canStart:         false,
  remainingSeconds: 40,
  itId:             null,
  leaderboard:      [],
  errorMessage:     null,
  arenaId:          'grassland',
  currentRound:     0,
  totalRounds:      3,
};

// ── Reducer ───────────────────────────────────────────────────────────────────

/**
 * Pure reducer function — produces new state from (state, action).
 * No side-effects: easy to test and replay.
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {

    case 'JOINED':
      return {
        ...state,
        myId:       action.payload.playerId,
        myColorIdx: action.payload.colorIdx,
        errorMessage: null,
      };

    case 'LOBBY_UPDATED':
      return {
        ...state,
        phase:    'LOBBY',
        players:  action.payload.players,
        canStart: action.payload.canStart,
      };

    case 'GAME_STARTED':
      return {
        ...state,
        phase:            'PLAYING',
        players:          action.payload.players,
        itId:             action.payload.itId,
        remainingSeconds: action.payload.remainingSeconds,
        arenaId:          action.payload.arenaId ?? state.arenaId,
        currentRound:     action.payload.currentRound ?? state.currentRound,
        totalRounds:      action.payload.totalRounds ?? state.totalRounds,
        leaderboard:      [],
        errorMessage:     null,
      };

    case 'STATE_UPDATED':
      return {
        ...state,
        players: action.payload.players,
      };

    case 'TAGGED':
      return {
        ...state,
        itId: action.payload.newItId,
      };

    case 'TIME_TICK':
      return {
        ...state,
        remainingSeconds: action.payload.remainingSeconds,
      };

    case 'GAME_ENDED':
      if (state.phase === 'ENDED') return state;
      return {
        ...state,
        phase:       'ENDED',
        leaderboard: action.payload.leaderboard,
      };

    case 'ROUND_ENDED':
      return {
        ...state,
        phase:        'ENDED',
        leaderboard:  action.payload.leaderboard,
        currentRound: action.payload.currentRound,
        totalRounds:  action.payload.totalRounds,
      };

    case 'ERROR':
      return {
        ...state,
        errorMessage: action.payload.message,
      };

    case 'CLEAR_ERROR':
      return { ...state, errorMessage: null };

    case 'RESET_TO_LOBBY':
      return { ...initialGameState };

    default:
      return state;
  }
}
