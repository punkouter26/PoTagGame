import { AnimationName } from '@/constants/sprites';

interface SpriteKey {
  animation: AnimationName;
  direction: string;
  frame:     number;
}

/**
 * SpriteLoader — caches HTMLImageElement objects by sprite path.
 *
 * Design: Flyweight pattern — one image object per unique path regardless of
 * how many players share the same sprite sheet.
 */
export class SpriteLoader {
  private static readonly cache = new Map<string, HTMLImageElement>();

  /** Returns a cached (or newly-started) image load for the sprite. */
  static get({ animation, direction, frame }: SpriteKey): HTMLImageElement | null {
    const frameStr = `frame_${String(frame).padStart(3, '0')}.png`;
    const path = `/sprites/animations/${animation}/${direction}/${frameStr}`;

    if (SpriteLoader.cache.has(path)) {
      const img = SpriteLoader.cache.get(path)!;
      // img.complete is true for both loaded AND broken images;
      // naturalWidth === 0 means the load failed.
      return (img.complete && img.naturalWidth > 0) ? img : null;
    }

    const img = new Image();
    img.src = path;
    SpriteLoader.cache.set(path, img);
    return null; // not ready yet this frame
  }

  /** Pre-fetches all frames for an animation so the first render is seamless. */
  static preload(animation: AnimationName, direction: string, frameCount: number): void {
    for (let i = 0; i < frameCount; i++) {
      SpriteLoader.get({ animation, direction, frame: i });
    }
  }
}
