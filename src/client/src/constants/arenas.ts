/** A rectangular wall that blocks player movement. */
export interface Wall {
  x:      number;
  y:      number;
  width:  number;
  height: number;
}

/** Definition of a game arena. */
export interface ArenaDefinition {
  id:         string;
  name:       string;
  bgColor:    string;
  wallColor:  string;
  walls:      Wall[];
}

/**
 * Built-in arena definitions.
 * Canvas is 1280×720. All coordinates in pixels.
 */
export const ARENAS: ArenaDefinition[] = [
  {
    id:        'grassland',
    name:      'Grassland',
    bgColor:   '#4a7c59',
    wallColor: '#3d5c42',
    walls:     [],  // Open field — no obstacles
  },
  {
    id:        'dungeon',
    name:      'Dungeon',
    bgColor:   '#2c2c3a',
    wallColor: '#5a5a6e',
    walls: [
      // Twin pillars flanking center (clear the 640,360 spawn point)
      { x: 540, y: 280, width: 60, height: 60 },
      { x: 680, y: 380, width: 60, height: 60 },
      // Corner blocks
      { x: 100, y:  80, width: 160, height: 40 },
      { x: 100, y:  80, width: 40,  height: 160 },
      { x: 1020, y: 80, width: 160, height: 40 },
      { x: 1140, y: 80, width: 40,  height: 160 },
      { x: 100, y: 600, width: 160, height: 40 },
      { x: 100, y: 480, width: 40,  height: 160 },
      { x: 1020, y: 600, width: 160, height: 40 },
      { x: 1140, y: 480, width: 40,  height: 160 },
      // Mid barriers
      { x: 380, y: 180, width: 40,  height: 160 },
      { x: 860, y: 180, width: 40,  height: 160 },
      { x: 380, y: 380, width: 40,  height: 160 },
      { x: 860, y: 380, width: 40,  height: 160 },
    ],
  },
  {
    id:        'rooftop',
    name:      'Rooftop',
    bgColor:   '#4a4a5a',
    wallColor: '#8b7355',
    walls: [
      // Central horizontal bar (shifted below center spawn)
      { x: 440, y: 400, width: 400, height: 40 },
      // Left L-shape
      { x: 150, y: 200, width: 200, height: 30 },
      { x: 150, y: 200, width: 30,  height: 150 },
      // Right L-shape
      { x: 930, y: 200, width: 200, height: 30 },
      { x: 1100, y: 200, width: 30,  height: 150 },
      // Bottom left block
      { x: 150, y: 500, width: 200, height: 30 },
      { x: 150, y: 500, width: 30,  height: 120 },
      // Bottom right block
      { x: 930, y: 500, width: 200, height: 30 },
      { x: 1100, y: 500, width: 30,  height: 120 },
      // Small obstacles scattered
      { x: 600, y: 150, width: 80,  height: 30 },
      { x: 600, y: 540, width: 80,  height: 30 },
    ],
  },
];

export const DEFAULT_ARENA_ID = 'grassland';

export function getArenaById(id: string): ArenaDefinition {
  return ARENAS.find(a => a.id === id) ?? ARENAS[0];
}
