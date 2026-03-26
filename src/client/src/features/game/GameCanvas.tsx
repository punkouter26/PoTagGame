import { useEffect, useRef } from 'react';
import type * as signalR from '@microsoft/signalr';
import type { GameState, PlayerSnapshot } from '@/types/game';
import { AnimationController } from '@/engine/AnimationController';
import { InputHandler } from '@/engine/InputHandler';
import { SpriteLoader } from '@/engine/SpriteLoader';
import { SPRITE_SIZE, PLAYER_COLORS } from '@/constants/sprites';
import { getArenaById, type Wall } from '@/constants/arenas';

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
    const me = gameState.players.find((p) => p.id === gameState.myId);
    if (me) { localX = me.x; localY = me.y; }

    let lastTime  = performance.now();
    let sendTimer = 0;
    let rafId     = 0;

    // ── Arena ────────────────────────────────────────────────────────────
    const arena = getArenaById(gameState.arenaId);

    // ── Grass pattern (only for grassland) ───────────────────────────────
    const grassPattern = arena.id === 'grassland' ? buildGrassPattern() : null;

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

      // ── Move local player ───────────────────────────────────────────
      let newX = localX;
      let newY = localY;
      if (input.left)  newX = Math.max(SPRITE_SIZE / 2, newX - SPEED);
      if (input.right) newX = Math.min(CANVAS_W - SPRITE_SIZE / 2, newX + SPEED);
      if (input.up)    newY = Math.max(SPRITE_SIZE / 2 + HUD_TOP, newY - SPEED);
      if (input.down)  newY = Math.min(CANVAS_H - SPRITE_SIZE / 2 - HUD_BOT, newY + SPEED);

      // Try X then Y independently so player can slide along walls
      if (!collidesWithWalls(newX, localY, SPRITE_SIZE / 2)) {
        localX = newX;
      }
      if (!collidesWithWalls(localX, newY, SPRITE_SIZE / 2)) {
        localY = newY;
      }

      // ── Send position to server ─────────────────────────────────────
      if (isOnline && connection && sendTimer >= 1 / SEND_HZ && gameState.myId) {
        sendTimer = 0;
        void connection
          .invoke('UpdatePosition', localX, localY, input.state, input.direction)
          .catch((e) => console.warn('[GameCanvas] UpdatePosition failed', e));
      }

      // ── Draw ────────────────────────────────────────────────────────
      // Background
      if (grassPattern) {
        ctx.fillStyle = grassPattern;
      } else {
        ctx.fillStyle = arena.bgColor;
      }
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

      // Merge server players with local override for self
      const renderPlayers = gameState.players.map((p) =>
        p.id === gameState.myId ? { ...p, x: localX, y: localY } : p,
      );

      // Add self if offline (not in player list)
      if (!gameState.players.some((p) => p.id === gameState.myId)) {
        renderPlayers.push({
          id:          'local',
          name:        'Player',
          colorIdx:    0,
          x:           localX,
          y:           localY,
          state:       input.state,
          direction:   input.direction,
          isIt:        true,
          itDuration:  0,
          immuneUntil: 0,
        } satisfies PlayerSnapshot);
      }

      for (const p of renderPlayers) {
        const anim  = getAnim(p.id);
        const state = p.id === gameState.myId ? input.state    : p.state;
        const dir   = p.id === gameState.myId ? input.direction : p.direction;
        anim.update(state, delta);

        const img = SpriteLoader.get({
          animation: anim.animationName,
          direction: dir,
          frame:     anim.frameIndex,
        });

        const isIt    = p.id === gameState.itId;
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
        if (p.id === gameState.myId && input.punch) {
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
    // Intentionally narrow deps — gameState changes are read inside render via closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, isOnline]);

  return (
    <div className="bg-black flex items-center justify-center h-screen overflow-hidden">

      {/* Canvas + HUD wrapper — preserves 16:9 and contains all overlays */}
      <div
        className="relative w-full"
        style={{ maxWidth: CANVAS_W, aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
      >
        {/* HUD overlay — now relative to the canvas, not the screen */}
        <div className="absolute top-2 left-0 right-0 flex justify-between px-4 z-10 pointer-events-none">
          <span
            data-testid="timer"
            className="bg-black/60 text-white px-3 py-1 rounded font-mono text-lg"
          >
            {gameState.remainingSeconds}s
          </span>

          {gameState.itId && (
            <span
              data-testid="it-badge"
              className="bg-red-600 text-white px-3 py-1 rounded font-bold"
            >
              {gameState.itId === gameState.myId
                ? 'YOU ARE IT!'
                : `IT: ${gameState.players.find((p) => p.id === gameState.itId)?.name ?? '?'}`}
            </span>
          )}
        </div>

        {/* Leave Game button */}
        <div className="absolute bottom-3 right-3 z-10">
          <button
            onClick={onLeave}
            className="bg-gray-800/80 hover:bg-gray-700 text-white text-sm px-3 py-1 rounded border border-gray-600"
          >
            Leave Game
          </button>
        </div>

        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          tabIndex={0}
          className="block w-full h-full"
          aria-label="Tag game canvas"
        />
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Builds a simple procedural grass tile via an off-screen canvas. */
function buildGrassPattern(): CanvasPattern | null {
  const size = 64;
  const off  = document.createElement('canvas');
  off.width  = size;
  off.height = size;
  const c    = off.getContext('2d')!;

  c.fillStyle = '#4a7c59';
  c.fillRect(0, 0, size, size);

  // Scatter lighter blades
  c.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    c.fillRect(x, y, 1 + Math.random(), 3 + Math.random() * 4);
  }

  const ctx2 = document.createElement('canvas').getContext('2d')!;
  return ctx2.createPattern(off, 'repeat');
}
