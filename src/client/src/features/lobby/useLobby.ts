import { useState, useCallback, useEffect } from 'react';
import type * as signalR from '@microsoft/signalr';

const STORAGE_KEY_NAME = 'potaggame_name';

export interface UseLobbyResult {
  name:        string;
  setName:     (n: string) => void;
  handleJoin:  () => void;
  resetJoin:   () => void;
  hasJoined:   boolean;
  clearSaved:  () => void;
  hasSavedName: boolean;
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

  // Auto-restore joined state after a round ends and LobbyScreen remounts:
  // if the server already knows this player (myId is set), skip the name form.
  useEffect(() => {
    if (myId) setHasJoined(true);
  }, [myId]);

  const resetJoin = useCallback(() => setHasJoined(false), []);

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

  const clearSaved = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_NAME);
    setName('');
    setHasJoined(false);
  }, []);

  return { name, setName, handleJoin, resetJoin, hasJoined, clearSaved, hasSavedName: savedName.length > 0 };
}
