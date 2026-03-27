import type { GameState } from '@/types/game';

interface GameHUDProps {
  gameState: GameState;
  onLeave:   () => void;
}

/** Frosted-glass HUD overlay: timer, round counter, IT badge, and leave button. */
export function GameHUD({ gameState, onLeave }: GameHUDProps) {
  return (
    <>
      {/* Top bar: timer + round + IT badge */}
      <div className="absolute top-2 left-0 right-0 flex justify-between items-start px-3 z-10 pointer-events-none">
        <span
          data-testid="timer"
          className="backdrop-blur-sm bg-black/40 text-white px-4 py-1.5 rounded-full font-mono text-lg tracking-wider border border-white/10 shadow-lg"
        >
          {gameState.remainingSeconds}s
        </span>

        {gameState.totalRounds > 1 && (
          <span className="backdrop-blur-sm bg-black/40 text-gray-300 px-3 py-1.5 rounded-full text-sm font-medium border border-white/10 shadow-lg">
            Rd {gameState.currentRound}/{gameState.totalRounds}
          </span>
        )}

        {gameState.itId && (
          <span
            data-testid="it-badge"
            className={`px-4 py-1.5 rounded-full font-bold text-white border shadow-lg animate-fade-in ${
              gameState.itId === gameState.myId
                ? 'bg-red-600/90 border-red-400/40 animate-pulse-glow'
                : 'backdrop-blur-sm bg-black/40 border-white/10'
            }`}
          >
            {gameState.itId === gameState.myId ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5" /></svg>
                YOU ARE IT!
              </span>
            ) : (
              `IT: ${gameState.players.find((p) => p.id === gameState.itId)?.name ?? '?'}`
            )}
          </span>
        )}
      </div>

      {/* Leave button */}
      <div className="absolute bottom-3 right-3 z-10">
        <button
          onClick={onLeave}
          aria-label="Leave Game"
          className="backdrop-blur-sm bg-black/40 hover:bg-black/60 text-white/70 hover:text-white w-9 h-9 rounded-full flex items-center justify-center border border-white/10 transition-all shadow-lg group"
          title="Leave Game"
        >
          <svg className="w-4 h-4 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </>
  );
}
