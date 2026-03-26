import arenasJson from '../../../shared/arenas.json';

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
 * Built-in arena definitions loaded from shared arenas.json
 * (single source of truth shared with the server).
 */
export const ARENAS: ArenaDefinition[] = arenasJson as ArenaDefinition[];

export const DEFAULT_ARENA_ID = 'grassland';

export function getArenaById(id: string): ArenaDefinition {
  return ARENAS.find(a => a.id === id) ?? ARENAS[0];
}
