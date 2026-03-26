import type { PlayerSnapshot } from '@/types/game';
import type { ArenaDefinition } from '@/constants/arenas';
import { PLAYER_COLORS } from '@/constants/sprites';

const MINIMAP_W      = 140;
const MINIMAP_MARGIN = 10;

interface DrawMiniMapOptions {
  ctx:        CanvasRenderingContext2D;
  arena:      ArenaDefinition;
  players:    PlayerSnapshot[];
  myId:       string | null;
  itId:       string | null;
  canvasW:    number;
  canvasH:    number;
  now:        number;
}

/** Renders the mini-map overlay in the bottom-left corner of the canvas. */
export function drawMiniMap({
  ctx, arena, players, myId, itId, canvasW, canvasH, now,
}: DrawMiniMapOptions): void {
  const minimapH = Math.round(MINIMAP_W * (canvasH / canvasW));
  const mmX = MINIMAP_MARGIN;
  const mmY = canvasH - minimapH - MINIMAP_MARGIN;

  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.roundRect(mmX, mmY, MINIMAP_W, minimapH, 6);
  ctx.fill();

  ctx.globalAlpha = 0.5;
  ctx.fillStyle = arena.bgColor;
  ctx.fillRect(mmX + 2, mmY + 2, MINIMAP_W - 4, minimapH - 4);

  if (arena.walls.length > 0) {
    ctx.fillStyle = arena.wallColor;
    for (const w of arena.walls) {
      const wx = mmX + 2 + (w.x / canvasW) * (MINIMAP_W - 4);
      const wy = mmY + 2 + (w.y / canvasH) * (minimapH - 4);
      const ww = (w.width / canvasW) * (MINIMAP_W - 4);
      const wh = (w.height / canvasH) * (minimapH - 4);
      ctx.fillRect(wx, wy, Math.max(ww, 1), Math.max(wh, 1));
    }
  }

  ctx.globalAlpha = 1;
  for (const p of players) {
    const dotX = mmX + 2 + (p.x / canvasW) * (MINIMAP_W - 4);
    const dotY = mmY + 2 + (p.y / canvasH) * (minimapH - 4);
    const dotR = p.id === myId ? 3.5 : 2.5;
    const isIt = p.id === itId;

    if (isIt) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 300);
      ctx.fillStyle = `rgba(255,60,60,${0.3 + pulse * 0.3})`;
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotR + 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = isIt ? '#ff4444' : (PLAYER_COLORS[p.colorIdx] ?? '#ffffff');
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
    ctx.fill();

    if (p.id === myId) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}
