/**
 * Sprite animation constants — mirrored from the existing sprite sheet metadata.
 * Animations: breathing-idle, walking, jumping-1, lead-jab
 * Directions:  north, south, east, west
 */
export const SPRITE_SIZE = 64;

export const ANIMATIONS = {
  'breathing-idle': { frameCount: 4,  fps: 6  },
  'walk':           { frameCount: 6,  fps: 12 },
  'jumping-1':      { frameCount: 9,  fps: 10 },
  'lead-jab':       { frameCount: 3,  fps: 14 },
} as const;

export type AnimationName = keyof typeof ANIMATIONS;

/** Maps player state string (from server) → animation name */
export const STATE_TO_ANIM: Record<string, AnimationName> = {
  IDLE:  'breathing-idle',
  WALK:  'walk',
  JUMP:  'jumping-1',
  PUNCH: 'lead-jab',
};

/** Player tint colours indexed by colorIdx */
export const PLAYER_COLORS = [
  '#e74c3c', // 0 red
  '#3498db', // 1 blue
  '#2ecc71', // 2 green
  '#f39c12', // 3 orange
  '#9b59b6', // 4 purple
  '#1abc9c', // 5 teal
  '#e67e22', // 6 dark-orange
  '#e91e63', // 7 pink
] as const;
