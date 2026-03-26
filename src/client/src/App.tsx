import { useEffect, useRef, useState, useCallback } from 'react';
import { useSignalR } from '@/features/connection/useSignalR';
import { useGame } from '@/features/game/useGame';
import { LobbyScreen } from '@/features/lobby/LobbyScreen';
import { GameCanvas } from '@/features/game/GameCanvas';
import { ReplayViewer, type ReplayData } from '@/features/game/ReplayViewer';
import { DEFAULT_ARENA_ID } from '@/constants/arenas';

const HUB_URL = '/tagHub';  // relative — same origin as .NET server

/**
 * App — the root component.
 *
 * Responsibilities:
 * - Establish and own the SignalR connection (single source of truth)
 * - Derive game phase from reducer state
 * - Render Lobby or GameCanvas based on phase
 *
 * Phase transitions are driven entirely by server events dispatched
 * through useGame → gameReducer (no ad-hoc setState calls).
 */
export default function App() {
  const { connection, status, isOnline } = useSignalR(HUB_URL);
  const { state, sendStart }             = useGame(connection, isOnline);
  const [selectedArenaId, setSelectedArenaId] = useState(DEFAULT_ARENA_ID);

  // ── Replay state ────────────────────────────────────────────────────────
  const [replayData, setReplayData]   = useState<ReplayData | null>(null);
  const [showReplay, setShowReplay]   = useState(false);

  // Listen for ReplayData from server
  useEffect(() => {
    if (!connection) return;
    const handler = (data: ReplayData | null) => {
      if (data && data.frames && data.frames.length > 0) {
        setReplayData(data);
        setShowReplay(true);
        setShowEndOverlay(false);
      }
    };
    connection.on('ReplayData', handler);
    return () => { connection.off('ReplayData', handler); };
  }, [connection]);

  const handleWatchReplay = useCallback(() => {
    if (connection && isOnline) {
      void connection.invoke('GetReplay').catch(console.error);
    }
  }, [connection, isOnline]);

  // ── Round Over overlay minimum display time ─────────────────────────────
  // Hold the overlay open for at least 6 s so players can read the leaderboard
  // before the server's auto-reset LobbyUpdated arrives (~3 s after game end).
  const [showEndOverlay, setShowEndOverlay] = useState(false);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (state.phase === 'ENDED') {
      setShowEndOverlay(true);
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      endTimerRef.current = setTimeout(() => setShowEndOverlay(false), 6_000);
    }
    return () => {
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
    };
  }, [state.phase]);

  return (
    <>
      {state.phase !== 'PLAYING' ? (
        <LobbyScreen
          gameState={state}
          connection={connection}
          isOnline={isOnline}
          connStatus={status}
          onStart={() => sendStart(selectedArenaId)}
          selectedArenaId={selectedArenaId}
          onArenaChange={setSelectedArenaId}
        />
      ) : (
        <GameCanvas
          gameState={state}
          connection={connection}
          isOnline={isOnline}
          onLeave={() => window.location.reload()}
        />
      )}

      {/* Game-ended overlay — stays visible for at least 6 s after round end */}
      {showEndOverlay && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-8 text-white w-full max-w-sm">
            <h2 className="text-2xl font-bold mb-4 text-center">Round Over!</h2>
            <ol className="space-y-2 mb-6">
              {state.leaderboard.map((p, i) => (
                <li key={p.id} className="flex justify-between">
                  <span>
                    {i + 1}. {p.name}
                    {p.id === state.myId && (
                      <span className="ml-1 text-xs text-gray-400">(you)</span>
                    )}
                  </span>
                  <span className="text-gray-400">{p.itDuration.toFixed(1)}s IT</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-2">
              {isOnline && (
                <button
                  className="w-full bg-gray-600 hover:bg-gray-500 text-white py-2 rounded font-semibold"
                  onClick={handleWatchReplay}
                >
                  Watch Replay
                </button>
              )}
              <button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-semibold"
                onClick={() => window.location.reload()}
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replay viewer overlay */}
      {showReplay && replayData && (
        <ReplayViewer
          data={replayData}
          onClose={() => setShowReplay(false)}
        />
      )}
    </>
  );
}
