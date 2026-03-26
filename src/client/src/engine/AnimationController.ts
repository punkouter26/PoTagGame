import { ANIMATIONS, AnimationName, STATE_TO_ANIM } from '@/constants/sprites';

/**
 * AnimationController — manages per-player frame state.
 *
 * Design: each player (self + remotes) gets one controller instance.
 * Updates are time-based so remote players animate correctly even
 * when we only receive position packets at 20 fps.
 */
export class AnimationController {
  private currentAnim: AnimationName = 'breathing-idle';
  private frame = 0;
  private elapsed = 0;

  /** Call every render frame with the delta time in seconds. */
  update(stateName: string, deltaSeconds: number): void {
    const anim = STATE_TO_ANIM[stateName] ?? 'breathing-idle';

    if (anim !== this.currentAnim) {
      this.currentAnim = anim;
      this.frame       = 0;
      this.elapsed     = 0;
    }

    const { frameCount, fps } = ANIMATIONS[this.currentAnim];
    this.elapsed += deltaSeconds;

    const frameDuration = 1 / fps;
    while (this.elapsed >= frameDuration) {
      this.elapsed -= frameDuration;
      this.frame    = (this.frame + 1) % frameCount;
    }
  }

  get animationName(): AnimationName { return this.currentAnim; }
  get frameIndex(): number           { return this.frame; }
}
