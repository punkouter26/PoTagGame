import { useEffect, useRef, useState } from 'react';
import { useSignalR } from '@/features/connection';
import { useGame } from '@/features/game';
import { LobbyScreen } from '@/features/lobby';
import { GameCanvas } from '@/features/game';
import { DEFAULT_ARENA_ID } from '@/constants/arenas';

const HUB_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/tagHub';

export default function App() {
  const { connection, status, isOnline } = useSignalR(HUB_URL);
  const { state, sendStart, resetToLobby } = useGame(connection, isOnline);
  const [selectedArenaId, setSelectedArenaId] = useState(DEFAULT_ARENA_ID);

  const isSessionOver = state.currentRound >= state.totalRounds;

  // Session-end overlay with minimum display time
  const [showSessionEnd, setShowSessionEnd] = useState(false);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (state.phase === 'ENDED' && isSessionOver) {
      setShowSessionEnd(true);
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      endTimerRef.current = setTimeout(() => setShowSessionEnd(false), 10_000);
    }
    return () => { if (endTimerRef.current) clearTimeout(endTimerRef.current); };
  }, [state.phase, isSessionOver]);

  // Inter-round banner (auto-dismisses when next round starts)
  const showRoundBanner = state.phase === 'ENDED' && !isSessionOver;

  return (
    <>
      {state.phase !== 'PLAYING' && !showRoundBanner ? (
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
          onLeave={() => resetToLobby()}
        />
      )}

      {/* Inter-round banner — brief overlay between rounds */}
      {showRoundBanner && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in pointer-events-none">
          <div className="glass-card rounded-2xl px-10 py-6 text-white text-center animate-scale-in shadow-2xl">
            <p className="text-sm text-gray-400 uppercase tracking-wider mb-1">
              Round {state.currentRound} of {state.totalRounds}
            </p>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Round Complete!
            </h2>
            <p className="text-gray-400 text-sm mt-2">Next round starting...</p>
          </div>
        </div>
      )}

      {/* Session-end overlay — final leaderboard */}
      {showSessionEnd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 animate-fade-in">
          <div className="glass-card rounded-2xl p-8 text-white w-full max-w-sm animate-scale-in shadow-2xl">
            <h2 className="text-2xl font-bold mb-4 text-center bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Game Over!
            </h2>
            <p className="text-center text-sm text-gray-400 mb-4">
              {state.totalRounds} rounds completed
            </p>
            <ol className="space-y-2 mb-6">
              {state.leaderboard.map((p, i) => (
                <li key={p.id} className="flex justify-between animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
                  <span>
                    {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {p.name}
                    {p.id === state.myId && (
                      <span className="ml-1 text-xs text-indigo-400">(you)</span>
                    )}
                  </span>
                  <span className="text-gray-400 font-mono">{p.itDuration.toFixed(1)}s IT</span>
                </li>
              ))}
            </ol>
            <button
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white py-2.5 rounded-xl font-semibold transition-all shadow-lg"
              onClick={() => { setShowSessionEnd(false); resetToLobby(); }}
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </>
  );
}
