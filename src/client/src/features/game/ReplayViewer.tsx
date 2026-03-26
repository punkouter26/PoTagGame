import { useEffect, useRef, useState } from 'react';
import type { PlayerSnapshot } from '@/types/game';
import { AnimationController } from '@/engine/AnimationController';
import { SpriteLoader } from '@/engine/SpriteLoader';
import { SPRITE_SIZE, PLAYER_COLORS } from '@/constants/sprites';
import { getArenaById } from '@/constants/arenas';

/** Mirrors server ReplayFrame */
export interface ReplayFrame {
  timestampMs: number;
  players:     PlayerSnapshot[];
}

/** Mirrors server ReplayData */
export interface ReplayData {
  arenaId: string;
  itId:    string;
  frames:  ReplayFrame[];
}

interface ReplayViewerProps {
  data:    ReplayData;
  onClose: () => void;
}

const CANVAS_W = 1280;
const CANVAS_H = 720;

/**
 * ReplayViewer — replays a round at 2× speed with a scrub bar.
 * Renders the same sprites/arena as GameCanvas but from recorded frames.
 */
export function ReplayViewer({ data, onClose }: ReplayViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const frameIdxRef = useRef(0);

  const totalFrames = data.frames.length;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || totalFrames === 0) return;
    const ctx = canvas.getContext('2d')!;

    const arena   = getArenaById(data.arenaId);
    const animMap = new Map<string, AnimationController>();
    const getAnim = (id: string): AnimationController => {
      if (!animMap.has(id)) animMap.set(id, new AnimationController());
      return animMap.get(id)!;
    };

    let rafId    = 0;
    let lastTime = performance.now();
    // 2× speed: advance ~2 frame indices per real second (frames are at ~1 fps)
    let accumulator = 0;
    const PLAYBACK_SPEED = 2;

    function render(now: number) {
      rafId = requestAnimationFrame(render);
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      if (playing) {
        accumulator += delta * PLAYBACK_SPEED;
        while (accumulator >= 1 && frameIdxRef.current < totalFrames - 1) {
          accumulator -= 1;
          frameIdxRef.current++;
        }
        setProgress(frameIdxRef.current / Math.max(1, totalFrames - 1));
      }

      const frame = data.frames[frameIdxRef.current];
      if (!frame) return;

      // Background
      ctx.fillStyle = arena.bgColor;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Walls
      if (arena.walls.length > 0) {
        ctx.fillStyle = arena.wallColor;
        for (const w of arena.walls) {
          ctx.fillRect(w.x, w.y, w.width, w.height);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        for (const w of arena.walls) {
          ctx.strokeRect(w.x, w.y, w.width, w.height);
        }
      }

      // Ghost overlay tint
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Players (semi-transparent ghost look)
      ctx.globalAlpha = 0.75;
      for (const p of frame.players) {
        const anim  = getAnim(p.id);
        anim.update(p.state, delta);

        const img = SpriteLoader.get({
          animation: anim.animationName,
          direction: p.direction,
          frame:     anim.frameIndex,
        });

        const isIt  = p.id === data.itId;
        const color = PLAYER_COLORS[p.colorIdx] ?? '#ffffff';
        const drawX = p.x - SPRITE_SIZE / 2;
        const drawY = p.y - SPRITE_SIZE / 2;

        if (img) {
          ctx.drawImage(img, drawX, drawY, SPRITE_SIZE, SPRITE_SIZE);
          if (isIt) {
            ctx.save();
            ctx.strokeStyle = '#ff2222';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#ff4444';
            ctx.shadowBlur = 10;
            ctx.strokeRect(drawX - 2, drawY - 2, SPRITE_SIZE + 4, SPRITE_SIZE + 4);
            ctx.restore();
          }
        } else {
          ctx.fillStyle = isIt ? '#ff4444' : color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, SPRITE_SIZE / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Name
        ctx.font      = '12px sans-serif';
        ctx.textAlign  = 'center';
        ctx.fillStyle  = '#ffffff';
        ctx.shadowColor = '#000';
        ctx.shadowBlur  = 3;
        ctx.fillText(p.name, Math.max(SPRITE_SIZE, Math.min(CANVAS_W - SPRITE_SIZE, p.x)), drawY - 4);
        ctx.shadowBlur = 0;

        if (isIt) {
          ctx.fillStyle = '#ff4444';
          ctx.fillText('IT', Math.max(SPRITE_SIZE, Math.min(CANVAS_W - SPRITE_SIZE, p.x)), drawY - 16);
        }
      }
      ctx.globalAlpha = 1;

      // "REPLAY" badge
      ctx.font      = 'bold 18px sans-serif';
      ctx.textAlign  = 'left';
      ctx.fillStyle  = '#ff6b6b';
      ctx.fillText('⏮ REPLAY (2×)', 10, 30);
    }

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [data, totalFrames, playing]);

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    frameIdxRef.current = Math.round(val * (totalFrames - 1));
    setProgress(val);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
      <div
        className="relative w-full"
        style={{ maxWidth: CANVAS_W, aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block w-full h-full rounded"
        />
      </div>

      {/* Scrub bar + controls */}
      <div className="flex items-center gap-3 mt-3 w-full px-8" style={{ maxWidth: CANVAS_W }}>
        <button
          onClick={() => setPlaying(!playing)}
          className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>

        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={handleScrub}
          className="flex-1 accent-blue-500"
        />

        <button
          onClick={onClose}
          className="bg-red-700 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}
