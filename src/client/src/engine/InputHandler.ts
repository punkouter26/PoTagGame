/**
 * InputHandler — tracks keyboard input state for the local player.
 *
 * Uses a Set of currently pressed keys so diagonal movement
 * (two directions simultaneously) is handled naturally.
 */
export class InputHandler {
  private readonly keys = new Set<string>();

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup',   this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    // Prevent arrow keys from scrolling the page during gameplay
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  get up():    boolean { return this.keys.has('ArrowUp')    || this.keys.has('KeyW'); }
  get down():  boolean { return this.keys.has('ArrowDown')  || this.keys.has('KeyS'); }
  get left():  boolean { return this.keys.has('ArrowLeft')  || this.keys.has('KeyA'); }
  get right(): boolean { return this.keys.has('ArrowRight') || this.keys.has('KeyD'); }
  get punch(): boolean { return this.keys.has('Space');                               }

  /** Returns WALK if any direction pressed, PUNCH if space, otherwise IDLE. */
  get state(): string {
    if (this.punch)                              return 'PUNCH';
    if (this.up || this.down || this.left || this.right) return 'WALK';
    return 'IDLE';
  }

  /** Returns the primary direction the player is facing. */
  get direction(): string {
    if (this.up)    return 'north';
    if (this.down)  return 'south';
    if (this.left)  return 'west';
    if (this.right) return 'east';
    return 'south'; // default
  }

  /** Clean up event listeners when the game unmounts. */
  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup',   this.onKeyUp);
  }
}
