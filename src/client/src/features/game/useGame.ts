import { useEffect, useReducer, useCallback, useRef } from 'react';
import type * as signalR from '@microsoft/signalr';
import { gameReducer, initialGameState } from './gameReducer';
import type { GameState, PlayerSnapshot } from '@/types/game';

/** Exposes the game state and the two actions the UI needs. */
export interface UseGameResult {
  state:         GameState;
  sendStart:     (arenaId: string) => void;
  resetToLobby:  () => void;
}

/**
 * useGame — drives the live game loop.
 *
 * Registers all SignalR callbacks, manages the RequestAnimationFrame loop,
 * and periodically syncs local position to the server.
 *
 * The local player's position is updated locally on every frame (smooth 60 fps)
 * and batched-sent to the server at SEND_HZ to keep bandwidth reasonable.
 */
export function useGame(
  connection: signalR.HubConnection | null,
  isOnline:   boolean,
): UseGameResult {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);

  // ── Register SignalR callbacks ──────────────────────────────────────────
  useEffect(() => {
    if (!connection) return;

    connection.on('Joined',        (p) => dispatch({ type: 'JOINED',        payload: p }));
    connection.on('LobbyUpdated',  (p) => dispatch({ type: 'LOBBY_UPDATED', payload: p }));
    connection.on('GameStarted',   (p) => dispatch({ type: 'GAME_STARTED',  payload: p }));
    connection.on('StateUpdated',  (p) => dispatch({ type: 'STATE_UPDATED', payload: p }));
    connection.on('Tagged',        (p) => dispatch({ type: 'TAGGED',        payload: p }));
    connection.on('TimeTick',      (p) => dispatch({ type: 'TIME_TICK',     payload: p }));
    connection.on('GameEnded',     (p) => dispatch({ type: 'GAME_ENDED',    payload: p }));
    connection.on('RoundEnded',    (p) => dispatch({ type: 'ROUND_ENDED',   payload: p }));
    connection.on('Error',         (p) => dispatch({ type: 'ERROR',         payload: p }));

    return () => {
      connection.off('Joined');
      connection.off('LobbyUpdated');
      connection.off('GameStarted');
      connection.off('StateUpdated');
      connection.off('Tagged');
      connection.off('TimeTick');
      connection.off('GameEnded');
      connection.off('RoundEnded');
      connection.off('Error');
    };
  }, [connection]);

  // ── Offline timer (Fix #8) ───────────────────────────────────────────
  // When offline and playing, drive the countdown timer locally.
  const offlineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (isOnline || state.phase !== 'PLAYING') {
      if (offlineTimerRef.current) { clearInterval(offlineTimerRef.current); offlineTimerRef.current = null; }
      return;
    }
    let remaining = state.remainingSeconds;
    offlineTimerRef.current = setInterval(() => {
      remaining--;
      dispatch({ type: 'TIME_TICK', payload: { remainingSeconds: remaining } });
      if (remaining <= 0) {
        if (offlineTimerRef.current) clearInterval(offlineTimerRef.current);
        dispatch({ type: 'GAME_ENDED', payload: { leaderboard: [] } });
      }
    }, 1_000);
    return () => { if (offlineTimerRef.current) clearInterval(offlineTimerRef.current); };
    // Only re-run when phase or online status changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, state.phase]);

  const sendStart = useCallback((arenaId: string) => {
    if (isOnline && connection) {
      void connection.invoke('StartGame', arenaId).catch((e) =>
        console.error('[useGame] StartGame failed', e),
      );
    } else {
      // Offline fallback: start a local solo session without a server
      const playerName = localStorage.getItem('potaggame_name') || 'Player';
      const localPlayer: PlayerSnapshot = {
        id: 'local', name: playerName, colorIdx: 0,
        x: 640, y: 360, state: 'IDLE', direction: 'south',
        isIt: true, itDuration: 0, immuneUntil: 0,
      };
      dispatch({ type: 'JOINED', payload: { playerId: 'local', colorIdx: 0 } });
      dispatch({
        type: 'GAME_STARTED',
        payload: {
          players:          [localPlayer],
          itId:             'local',
          remainingSeconds: 40,
          arenaId,
          currentRound:     1,
          totalRounds:      3,
        },
      });
    }
  }, [connection, isOnline]);

  return { state, sendStart, resetToLobby: () => dispatch({ type: 'RESET_TO_LOBBY' }) };
}
