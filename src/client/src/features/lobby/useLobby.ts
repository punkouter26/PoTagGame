import { useState, useCallback, useEffect, useRef } from 'react';
import type * as signalR from '@microsoft/signalr';

const STORAGE_KEY_NAME = 'potaggame_name';
const RETRY_INTERVAL_S = 3;

export interface UseLobbyResult {
  name:           string;
  setName:        (n: string) => void;
  handleJoin:     () => void;
  resetJoin:      () => void;
  hasJoined:      boolean;
  clearSaved:     () => void;
  hasSavedName:   boolean;
  retryCountdown: number | null;
}

/**
 * useLobby — encapsulates the "join lobby" interaction.
 * Separated from the UI component so logic is independently testable.
 */
export function useLobby(
  connection: signalR.HubConnection | null,
  isOnline:   boolean,
  myId:       string | null,
): UseLobbyResult {
  const savedName = localStorage.getItem(STORAGE_KEY_NAME) ?? '';
  const [name,      setName]      = useState(savedName);
  const [hasJoined, setHasJoined] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const retryRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-restore joined state after a round ends and LobbyScreen remounts:
  // if the server already knows this player (myId is set), skip the name form.
  useEffect(() => {
    if (myId) {
      setHasJoined(true);
      // Clear retry timer - successfully joined
      if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
      setRetryCountdown(null);
    }
  }, [myId]);

  const resetJoin = useCallback(() => {
    setHasJoined(false);
    if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
    setRetryCountdown(null);
  }, []);

  const handleJoin = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;

    // Persist name to localStorage for next visit
    localStorage.setItem(STORAGE_KEY_NAME, trimmed);

    if (isOnline && connection) {
      connection
        .invoke('JoinLobby', trimmed)
        .catch((e) => console.error('[useLobby] JoinLobby failed', e));
    } else {
      // Offline: dispatch a local "Joined" so the UI transitions correctly.
      // The parent App will pre-populate the game state via useGame.
      console.info('[useLobby] Offline mode — joining locally as', trimmed);
    }

    setHasJoined(true);
  }, [name, connection, isOnline]);

  // #8 — Auto-retry when error state is active (round just ended, etc.)
  useEffect(() => {
    if (!hasJoined || !isOnline || !connection || myId) {
      // Not in retry-needed state
      if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
      setRetryCountdown(null);
      return;
    }

    // Start countdown ticker
    let countdown = RETRY_INTERVAL_S;
    setRetryCountdown(countdown);

    retryRef.current = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        const trimmed = name.trim();
        if (trimmed && connection) {
          connection
            .invoke('JoinLobby', trimmed)
            .catch((e) => console.error('[useLobby] Auto-retry JoinLobby failed', e));
        }
        countdown = RETRY_INTERVAL_S;
      }
      setRetryCountdown(countdown);
    }, 1000);

    return () => {
      if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
    };
  }, [hasJoined, isOnline, connection, myId, name]);

  const clearSaved = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_NAME);
    setName('');
    setHasJoined(false);
    if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null; }
    setRetryCountdown(null);
  }, []);

  return { name, setName, handleJoin, resetJoin, hasJoined, clearSaved, hasSavedName: savedName.length > 0, retryCountdown };
}
