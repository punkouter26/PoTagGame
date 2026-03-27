import { useEffect, useRef, useState } from 'react';
import type * as signalR from '@microsoft/signalr';
import type { GameState, PlayerSnapshot } from '@/types/game';
import { AnimationController } from '@/engine/AnimationController';
import { InputHandler } from '@/engine/InputHandler';
import { SpriteLoader } from '@/engine/SpriteLoader';
import { SPRITE_SIZE, PLAYER_COLORS } from '@/constants/sprites';
import { getArenaById } from '@/constants/arenas';
import { useTouchControls } from './useTouchControls';
import { GameHUD } from './GameHUD';

const CANVAS_W = 1280;
const CANVAS_H = 720;
const SPEED    = 4;         // px/frame at 60 fps
const SEND_HZ  = 20;        // position-update rate to server
const HUD_TOP  = 44;        // px reserved for top HUD (timer + IT badge)
const HUD_BOT  = 50;        // px reserved for bottom HUD (Leave Game button)

interface GameCanvasProps {
  gameState:  GameState;
  connection: signalR.HubConnection | null;
  isOnline:   boolean;
  onLeave:    () => void;
}

/** Detect touch device */
function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * GameCanvas — the main rendering surface.
 *
 * Lifecycle:
 * 1. On mount: create InputHandler, per-player AnimationControllers, start RAF.
 * 2. Each frame: move local player, interpolate remotes, redraw.
 * 3. Every 1/SEND_HZ seconds: invoke UpdatePosition on the hub.
 * 4. On unmount: destroy InputHandler, cancel RAF.
 */
export function GameCanvas({ gameState, connection, isOnline, onLeave }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showTouch] = useState(isTouchDevice);
  const [showHint, setShowHint] = useState(() => !localStorage.getItem('potaggame_controls_seen'));

  // Keep gameState in a ref so the RAF loop always reads the latest values
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  // Responsive maxWidth — recalculated on window resize
  const [wrapperMaxWidth, setWrapperMaxWidth] = useState(
    () => `${(window.innerHeight / CANVAS_H) * CANVAS_W}px`,
  );
  useEffect(() => {
    const recalc = () => setWrapperMaxWidth(`${(window.innerHeight / CANVAS_H) * CANVAS_W}px`);
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, []);

  // Touch controls extracted to useTouchControls hook
  const { dirRef: touchDirRef, punchRef: touchPunchRef, handleTouchStart, handleTouchMove, handleTouchEnd } = useTouchControls();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const input      = new InputHandler();
    const animMap    = new Map<string, AnimationController>();
    const getAnim    = (id: string): AnimationController => {
      if (!animMap.has(id)) animMap.set(id, new AnimationController());
      return animMap.get(id)!;
    };

    // Local player position (independent from server snapshots for smooth movement)
    let localX = CANVAS_W / 2;
    let localY = CANVAS_H / 2;

    // Initialise from server snapshot if we already have a position
    const me = gameStateRef.current.players.find((p) => p.id === gameStateRef.current.myId);
    if (me) { localX = me.x; localY = me.y; }

    let lastTime  = performance.now();
    let sendTimer = 0;
    let rafId     = 0;

    // ── Arena ────────────────────────────────────────────────────────────
    const arena = getArenaById(gameStateRef.current.arenaId);

    /** Check circle vs arena walls collision */
    function collidesWithWalls(cx: number, cy: number, radius: number): boolean {
      for (const w of arena.walls) {
        const nearX = Math.max(w.x, Math.min(cx, w.x + w.width));
        const nearY = Math.max(w.y, Math.min(cy, w.y + w.height));
        const dx = cx - nearX;
        const dy = cy - nearY;
        if (dx * dx + dy * dy < radius * radius) return true;
      }
      return false;
    }

    function render(now: number) {
      rafId = requestAnimationFrame(render);

      const delta = (now - lastTime) / 1_000;
      lastTime    = now;
      sendTimer  += delta;

      // ── Merge keyboard + touch input ────────────────────────────────
      const td = touchDirRef.current;
      const touchLeft  = td.dx < -0.3;
      const touchRight = td.dx >  0.3;
      const touchUp    = td.dy < -0.3;
      const touchDown  = td.dy >  0.3;

      const moveLeft  = input.left  || touchLeft;
      const moveRight = input.right || touchRight;
      const moveUp    = input.up    || touchUp;
      const moveDown  = input.down  || touchDown;
      const isPunch   = input.punch || touchPunchRef.current;

      // Compute aggregated state/direction for touch + keyboard
      let aggregatedState = 'IDLE';
      let aggregatedDir   = input.direction; // default from keyboard
      if (isPunch)   aggregatedState = 'PUNCH';
      else if (moveUp || moveDown || moveLeft || moveRight) aggregatedState = 'WALK';

      if (touchUp)         aggregatedDir = 'north';
      else if (touchDown)  aggregatedDir = 'south';
      else if (touchLeft)  aggregatedDir = 'west';
      else if (touchRight) aggregatedDir = 'east';

      // Override with keyboard direction if keyboard is active
      if (input.up || input.down || input.left || input.right) {
        aggregatedDir = input.direction;
      }

      // ── Move local player ───────────────────────────────────────────
      let newX = localX;
      let newY = localY;
      if (moveLeft)  newX = Math.max(SPRITE_SIZE / 2, newX - SPEED);
      if (moveRight) newX = Math.min(CANVAS_W - SPRITE_SIZE / 2, newX + SPEED);
      if (moveUp)    newY = Math.max(SPRITE_SIZE / 2 + HUD_TOP, newY - SPEED);
      if (moveDown)  newY = Math.min(CANVAS_H - SPRITE_SIZE / 2 - HUD_BOT, newY + SPEED);

      // Try X then Y independently so player can slide along walls
      if (!collidesWithWalls(newX, localY, SPRITE_SIZE / 2)) {
        localX = newX;
      }
      if (!collidesWithWalls(localX, newY, SPRITE_SIZE / 2)) {
        localY = newY;
      }

      // ── Send position to server ─────────────────────────────────────
      if (isOnline && connection && sendTimer >= 1 / SEND_HZ && gameStateRef.current.myId) {
        sendTimer = 0;
        void connection
          .invoke('UpdatePosition', localX, localY, aggregatedState, aggregatedDir)
          .catch((e) => console.warn('[GameCanvas] UpdatePosition failed', e));
      }

      // ── Draw ────────────────────────────────────────────────────────
      // Background
      ctx.fillStyle = arena.bgColor;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Arena walls
      if (arena.walls.length > 0) {
        ctx.fillStyle = arena.wallColor;
        for (const w of arena.walls) {
          ctx.fillRect(w.x, w.y, w.width, w.height);
        }
        // Subtle wall edge highlights
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        for (const w of arena.walls) {
          ctx.strokeRect(w.x, w.y, w.width, w.height);
        }
      }

      // Read latest state from ref (avoids stale closure for multiplayer updates)
      const gs = gameStateRef.current;

      // Merge server players with local override for self
      const renderPlayers = gs.players.map((p) =>
        p.id === gs.myId ? { ...p, x: localX, y: localY } : p,
      );

      // Add self if offline (not in player list)
      if (!gs.players.some((p) => p.id === gs.myId)) {
        renderPlayers.push({
          id:          'local',
          name:        'Player',
          colorIdx:    0,
          x:           localX,
          y:           localY,
          state:       aggregatedState,
          direction:   aggregatedDir,
          isIt:        true,
          itDuration:  0,
          immuneUntil: 0,
        } satisfies PlayerSnapshot);
      }

      for (const p of renderPlayers) {
        const anim  = getAnim(p.id);
        const state = p.id === gs.myId ? aggregatedState : p.state;
        const dir   = p.id === gs.myId ? aggregatedDir   : p.direction;
        anim.update(state, delta);

        const img = SpriteLoader.get({
          animation: anim.animationName,
          direction: dir,
          frame:     anim.frameIndex,
        });

        const isIt    = p.id === gs.itId;
        const color   = PLAYER_COLORS[p.colorIdx] ?? '#ffffff';
        const drawX   = p.x - SPRITE_SIZE / 2;
        const drawY   = p.y - SPRITE_SIZE / 2;

        if (img) {
          ctx.drawImage(img, drawX, drawY, SPRITE_SIZE, SPRITE_SIZE);
          if (isIt) {
            // Pulsating glow aura around IT player
            ctx.save();
            const pulse = 0.5 + 0.5 * Math.sin(now / 200);
            const glowRadius = SPRITE_SIZE * 0.7 + pulse * 6;
            const gradient = ctx.createRadialGradient(p.x, p.y, SPRITE_SIZE * 0.3, p.x, p.y, glowRadius);
            gradient.addColorStop(0, `rgba(255, 40, 40, ${0.25 + pulse * 0.15})`);
            gradient.addColorStop(1, 'rgba(255, 40, 40, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        } else {
          // Fallback circle while sprites load
          ctx.fillStyle   = isIt ? '#ff4444' : color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, SPRITE_SIZE / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Name label — clamp x so text doesn't bleed off canvas edges
        const labelX = Math.max(SPRITE_SIZE, Math.min(CANVAS_W - SPRITE_SIZE, p.x));
        ctx.font        = '12px sans-serif';
        ctx.textAlign   = 'center';
        ctx.shadowColor = '#000';
        ctx.shadowBlur  = 3;
        ctx.fillStyle   = '#ffffff';
        ctx.fillText(p.name, labelX, drawY - 4);
        ctx.shadowBlur  = 0;

        if (isIt) {
          ctx.fillStyle = '#ff4444';
          ctx.fillText('IT', labelX, drawY - 16);
        }

        // Punch flash effect
        if (p.id === gs.myId && isPunch) {
          ctx.save();
          const flashGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, SPRITE_SIZE * 1.2);
          flashGrad.addColorStop(0, 'rgba(255, 255, 200, 0.35)');
          flashGrad.addColorStop(1, 'rgba(255, 255, 200, 0)');
          ctx.fillStyle = flashGrad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, SPRITE_SIZE * 1.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

    }

    rafId = requestAnimationFrame(render);
    canvas.focus();

    return () => {
      cancelAnimationFrame(rafId);
      input.destroy();
    };
    // Deps: connection/isOnline only — gameState reads go through gameStateRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, isOnline]);

  return (
    <div className="bg-black flex items-center justify-center h-screen overflow-hidden">

      {/* #7 — Canvas + HUD wrapper — fills viewport width, maintains 16:9 */}
      <div
        className="relative w-full h-full max-h-screen"
        style={{ maxWidth: wrapperMaxWidth, aspectRatio: `${CANVAS_W} / ${CANVAS_H}`, margin: '0 auto' }}
      >
        <GameHUD gameState={gameState} onLeave={onLeave} />

        {/* One-time controls hint overlay */}
        {showHint && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer"
            onClick={() => { localStorage.setItem('potaggame_controls_seen', '1'); setShowHint(false); }}
            onKeyDown={(e) => { if (e.key) { localStorage.setItem('potaggame_controls_seen', '1'); setShowHint(false); } }}
            role="button"
            tabIndex={0}
          >
            <div className="glass-card rounded-2xl px-8 py-6 text-center space-y-3 animate-scale-in pointer-events-none">
              <h3 className="text-white font-bold text-lg">Controls</h3>
              <div className="flex gap-6 justify-center text-gray-300 text-sm">
                <span className="flex items-center gap-2">
                  <kbd className="px-2 py-1 rounded bg-white/10 text-white font-mono text-xs">WASD</kbd>
                  Move
                </span>
                <span className="flex items-center gap-2">
                  <kbd className="px-2 py-1 rounded bg-white/10 text-white font-mono text-xs">Space</kbd>
                  Punch
                </span>
              </div>
              <p className="text-gray-500 text-xs">Click or press any key to start</p>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          tabIndex={0}
          className="block w-full h-full"
          aria-label="Tag game canvas"
        />
      </div>

      {/* #10 — Mobile swipe controls: drag to move, tap to punch */}
      {showTouch && (
        <div
          className="touch-control fixed inset-0 z-0"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        />
      )}
    </div>
  );
}


