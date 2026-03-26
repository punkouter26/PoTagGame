import { useRef, useCallback } from 'react';

export interface TouchControlState {
  /** Normalized direction vector (-1 to 1 per axis) */
  dirRef: React.MutableRefObject<{ dx: number; dy: number }>;
  /** True while a tap-punch gesture is active */
  punchRef: React.MutableRefObject<boolean>;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove:  (e: React.TouchEvent) => void;
  handleTouchEnd:   (e: React.TouchEvent) => void;
}

/**
 * useTouchControls — full-screen swipe + tap-to-punch for mobile devices.
 * Drag to set direction; quick tap (< 250 ms, < 15 px) fires a punch.
 */
export function useTouchControls(): TouchControlState {
  const dirRef   = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const punchRef = useRef(false);

  const swipeTouchIdRef = useRef<number | null>(null);
  const swipeStartRef   = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (swipeTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    swipeTouchIdRef.current = touch.identifier;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (swipeTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier !== swipeTouchIdRef.current || !swipeStartRef.current) continue;
      const dx = touch.clientX - swipeStartRef.current.x;
      const dy = touch.clientY - swipeStartRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 60;
      const norm = Math.min(dist, maxDist) / maxDist;
      if (dist > 8) {
        dirRef.current = { dx: (dx / dist) * norm, dy: (dy / dist) * norm };
      } else {
        dirRef.current = { dx: 0, dy: 0 };
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier !== swipeTouchIdRef.current) continue;
      if (swipeStartRef.current) {
        const elapsed = Date.now() - swipeStartRef.current.time;
        const touch = e.changedTouches[i];
        const dist = Math.sqrt(
          (touch.clientX - swipeStartRef.current.x) ** 2 +
          (touch.clientY - swipeStartRef.current.y) ** 2,
        );
        if (elapsed < 250 && dist < 15) {
          punchRef.current = true;
          setTimeout(() => { punchRef.current = false; }, 200);
        }
      }
      dirRef.current = { dx: 0, dy: 0 };
      swipeTouchIdRef.current = null;
      swipeStartRef.current = null;
    }
  }, []);

  return { dirRef, punchRef, handleTouchStart, handleTouchMove, handleTouchEnd };
}
