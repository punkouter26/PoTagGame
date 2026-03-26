import type { PlayerSnapshot, GameState } from '@/types/game';
import { Button } from '@/components/Button';
import { ConnectionBadge } from '@/components/ConnectionBadge';
import { InvitePanel } from '@/components/InvitePanel';
import { ArenaPicker } from '@/components/ArenaPicker';
import { PLAYER_COLORS } from '@/constants/sprites';
import type { ConnectionStatus } from '@/features/connection/useSignalR';
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
  const { name, setName, handleJoin, resetJoin, hasJoined, clearSaved, hasSavedName } = useLobby(connection, isOnline, gameState.myId);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-6 p-4"
         style={{ backgroundImage: 'radial-gradient(circle at 50% 40%, rgba(59,130,246,0.06) 0%, transparent 60%)' }}>

      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-4xl font-bold tracking-tight">PoTagGame</h1>
        <ConnectionBadge status={connStatus} />
      </div>

      {/* Subtitle */}
      <p className="text-gray-400 text-sm -mt-4">Real-time multiplayer tag — be the last one standing!</p>

      {/* Error banner */}
      {gameState.errorMessage && (
        <div className="bg-red-700 rounded px-4 py-2 text-sm max-w-md text-center">
          {gameState.errorMessage}
        </div>
      )}

      {/* Offline notice */}
      {!isOnline && (
        <div className="bg-yellow-700 rounded px-4 py-2 text-sm max-w-md text-center">
          No server connection — you can still start a solo game offline.
        </div>
      )}

      {/* Join form */}
      {!hasJoined && (
        <form
          className="flex flex-col items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); handleJoin(); }}
        >
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              className="px-3 py-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <Button type="submit" disabled={!name.trim()}>
              Join
            </Button>
          </div>
          {hasSavedName && (
            <button
              type="button"
              onClick={clearSaved}
              className="text-xs text-gray-400 hover:text-gray-200 underline"
            >
              not you? change name
            </button>
          )}
        </form>
      )}

      {/* Player list */}
      {gameState.players.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4 w-full max-w-sm">
          <h2 className="text-lg font-semibold mb-2">In Lobby ({gameState.players.length})</h2>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {gameState.players.map((p: PlayerSnapshot) => (
              <li key={p.id} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{ backgroundColor: PLAYER_COLORS[p.colorIdx] ?? '#fff' }}
                />
                <span>
                  {p.name}
                  {p.id === gameState.myId && (
                    <span className="ml-1 text-xs text-gray-400">(you)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Start button — visible once joined and canStart is true */}
      {hasJoined && gameState.canStart && (
        <>
          <ArenaPicker selectedId={selectedArenaId} onChange={onArenaChange} />
          <InvitePanel />
          <Button onClick={onStart} className="text-lg px-8 py-3">
            Start Game
          </Button>
        </>
      )}

      {/* Offline start — always available after joining name */}
      {hasJoined && !isOnline && !gameState.canStart && (
        <Button onClick={onStart} className="text-lg px-8 py-3">
          Start Solo (Offline)
        </Button>
      )}

      {/* Recovery: server rejected join while online — let player retry */}
      {hasJoined && isOnline && gameState.errorMessage && !gameState.canStart && (
        <Button onClick={resetJoin} className="text-lg px-8 py-3 bg-gray-600 hover:bg-gray-500">
          Try Again
        </Button>
      )}

      {/* Controls legend */}
      <div className="text-gray-500 text-xs flex gap-4 mt-2">
        <span>WASD / Arrows — Move</span>
        <span>Space — Punch</span>
      </div>
    </div>
  );
}
