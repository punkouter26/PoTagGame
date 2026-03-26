import { ARENAS, type ArenaDefinition } from '@/constants/arenas';

const ARENA_DESCRIPTIONS: Record<string, string> = {
  grassland: 'Open field — nowhere to hide',
  dungeon:   'Maze corridors & pillars',
  rooftop:   'Rooftop obstacles & L-walls',
};

interface ArenaPickerProps {
  selectedId: string;
  onChange:   (id: string) => void;
}

/** Arena selection strip for the lobby. */
export function ArenaPicker({ selectedId, onChange }: ArenaPickerProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 w-full max-w-md">
      <h2 className="text-lg font-semibold mb-2">Arena</h2>
      <div className="flex gap-3">
        {ARENAS.map((arena: ArenaDefinition) => (
          <button
            key={arena.id}
            onClick={() => onChange(arena.id)}
            className={`flex-1 rounded p-2 text-sm font-medium transition-colors border-2 ${
              arena.id === selectedId
                ? 'border-blue-400 bg-gray-700'
                : 'border-transparent bg-gray-700/50 hover:bg-gray-700'
            }`}
          >
            {/* Larger arena preview */}
            <div
              className="w-full rounded mb-1 relative overflow-hidden"
              style={{ backgroundColor: arena.bgColor, aspectRatio: '16 / 9', minHeight: 56 }}
            >
              {arena.walls.map((w, i) => (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    left:    `${(w.x / 1280) * 100}%`,
                    top:     `${(w.y / 720) * 100}%`,
                    width:   `${(w.width / 1280) * 100}%`,
                    height:  `${(w.height / 720) * 100}%`,
                    backgroundColor: arena.wallColor,
                    borderRadius: 1,
                  }}
                />
              ))}
            </div>
            <span className="block font-medium">{arena.name}</span>
            <span className="block text-xs text-gray-400 mt-0.5">{ARENA_DESCRIPTIONS[arena.id] ?? ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
