import { useEffect, useRef, useState } from 'react';
import type { PlayerSnapshot, GameState } from '@/types/game';
import { Button } from '@/components/Button';
import { ConnectionBadge } from '@/components/ConnectionBadge';
import { InvitePanel } from '@/components/InvitePanel';
import { ARENAS, type ArenaDefinition } from '@/constants/arenas';
import { PLAYER_COLORS } from '@/constants/sprites';
import type { ConnectionStatus } from '@/features/connection';
import { useLobby } from './useLobby';
import type * as signalR from '@microsoft/signalr';

interface LobbyScreenProps {
  gameState:        GameState;
  connection:       signalR.HubConnection | null;
  isOnline:         boolean;
  connStatus:       ConnectionStatus;
  onStart:          () => void;
  selectedArenaId:  string;
  onArenaChange:    (id: string) => void;
}

/** Lobby UI — name input, player list, start button. */
export function LobbyScreen({
  gameState,
  connection,
  isOnline,
  connStatus,
  onStart,
  selectedArenaId,
  onArenaChange,
}: LobbyScreenProps) {
  const { name, setName, handleJoin, resetJoin, hasJoined, clearSaved, hasSavedName, retryCountdown } = useLobby(
    connection, 
    isOnline, 
    gameState.myId, 
    gameState.joinRejectedCode
  );
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-start countdown when 2+ players are in the lobby
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const enoughPlayers = gameState.players.length >= 2 && gameState.canStart && hasJoined;
    if (enoughPlayers && countdown === null) {
      setCountdown(5);
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev === null || prev <= 1) return 0;
          return prev - 1;
        });
      }, 1000);
    } else if (!enoughPlayers) {
      setCountdown(null);
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [gameState.players.length, gameState.canStart, hasJoined]);

  useEffect(() => {
    if (countdown === 0) {
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
      onStart();
    }
  }, [countdown, onStart]);

  // #6 — Auto-focus the name input on mount
  useEffect(() => {
    if (!hasJoined && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [hasJoined]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-6 p-4"
         style={{ backgroundImage: 'radial-gradient(circle at 50% 30%, rgba(99,102,241,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(168,85,247,0.05) 0%, transparent 40%)' }}>

      {/* #1 — Header with gradient branding */}
      <div className="flex items-center gap-3 animate-fade-in">
        <svg className="w-10 h-10 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.5 8a4.5 4.5 0 1 0-5 4.47V16h-2a1 1 0 0 0 0 2h2v2a1 1 0 0 0 2 0v-2h2a1 1 0 0 0 0-2h-2v-3.53A4.5 4.5 0 0 0 17.5 8Z" />
          <circle cx="13" cy="8" r="2.5" fill="currentColor" opacity="0.3" />
        </svg>
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          PoTagGame
        </h1>
        <ConnectionBadge status={connStatus} />
      </div>

      {/* Subtitle */}
      <p className="text-gray-400 text-sm -mt-4 tracking-wide animate-fade-in delay-75">
        Real-time multiplayer tag — be the last one standing!
      </p>

      {/* Error banner */}
      {gameState.errorMessage && (
        <div className="glass-card rounded-xl px-4 py-3 text-sm max-w-md text-center border-red-500/30 bg-red-500/10 animate-scale-in flex flex-col gap-2">
          <span>{gameState.errorMessage}</span>
          {gameState.joinRejectedCode !== 'LobbyFull' && hasJoined && retryCountdown !== null && (
            <span className="text-xs text-red-300 font-medium">Auto-retrying in {retryCountdown}s...</span>
          )}
          {gameState.joinRejectedCode === 'LobbyFull' && (
            <Button onClick={() => handleJoin()} className="mt-2 text-xs py-1 px-3 self-center">
              Try Again
            </Button>
          )}
        </div>
      )}

      {/* Join form */}
      {!hasJoined && (
        <form
          className="flex flex-col items-center gap-3 animate-fade-in-up delay-150"
          onSubmit={(e) => { e.preventDefault(); handleJoin(); }}
        >
          <div className="flex gap-2">
            <label htmlFor="player-name" className="sr-only">Player name</label>
            <input
              id="player-name"
              ref={nameInputRef}
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              autoFocus
              className="px-4 py-2.5 rounded-xl bg-white/5 text-white border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400/40 backdrop-blur-sm placeholder-gray-500 transition-all"
            />
            <Button type="submit" disabled={!name.trim()}>
              Join
            </Button>
          </div>
          {hasSavedName && (
            <button
              type="button"
              onClick={clearSaved}
              className="text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2 transition-colors"
            >
              not you? change name
            </button>
          )}
        </form>
      )}

      {/* #2 — Player list with glass card */}
      {gameState.players.length > 0 && (
        <div className="glass-card rounded-2xl p-5 w-full max-w-sm animate-fade-in-up">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
            In Lobby
            <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold">
              {gameState.players.length}
            </span>
          </h2>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {gameState.players.map((p: PlayerSnapshot, idx: number) => (
              <li
                key={p.id}
                className="flex items-center gap-2.5 py-1 animate-slide-in-player"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <span
                  className="w-3 h-3 rounded-full inline-block ring-2 ring-white/10"
                  style={{ backgroundColor: PLAYER_COLORS[p.colorIdx] ?? '#fff' }}
                />
                <span className="font-medium">
                  {p.name}
                  {p.id === gameState.myId && (
                    <span className="ml-1.5 text-xs text-indigo-300/70">(you)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Arena picker + start controls */}
      {hasJoined && gameState.canStart && (
        <>
          <div className="flex items-center gap-3 animate-fade-in-up delay-75">
            <label htmlFor="arena-select" className="text-sm text-gray-400 font-medium">Arena</label>
            <select
              id="arena-select"
              value={selectedArenaId}
              onChange={(e) => onArenaChange(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white/5 text-white border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400/60 backdrop-blur-sm text-sm appearance-none cursor-pointer"
            >
              {ARENAS.map((arena: ArenaDefinition) => (
                <option key={arena.id} value={arena.id} className="bg-gray-900 text-white">
                  {arena.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 animate-fade-in-up delay-150">
            <InvitePanel />
          </div>
          <Button onClick={onStart} className="text-lg px-10 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] animate-fade-in-up delay-225">
            {countdown !== null && countdown > 0
              ? `Starting in ${countdown}s — Start Now`
              : 'Start Game'}
          </Button>
        </>
      )}

      {/* Offline start */}
      {hasJoined && !isOnline && !gameState.canStart && (
        <Button onClick={onStart} className="text-lg px-8 py-3 animate-fade-in-up">
          Start Solo (Offline)
        </Button>
      )}

      {/* #8 — Recovery with auto-retry countdown */}
      {hasJoined && isOnline && gameState.errorMessage && !gameState.canStart && (
        <div className="flex flex-col items-center gap-3 animate-scale-in">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {retryCountdown !== null && retryCountdown > 0
              ? <span>Retrying in {retryCountdown}s…</span>
              : <span>Retrying…</span>
            }
          </div>
          <Button onClick={resetJoin} className="bg-gray-600 hover:bg-gray-500">
            Change Name
          </Button>
        </div>
      )}
    </div>
  );
}
