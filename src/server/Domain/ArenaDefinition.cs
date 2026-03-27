using System.Text.Json;
using System.Text.Json.Serialization;

namespace PoTagGame.Domain;

/// <summary>Rectangular wall obstacle in an arena.</summary>
public sealed record ArenaWall(
    [property: JsonPropertyName("x")]      float X,
    [property: JsonPropertyName("y")]      float Y,
    [property: JsonPropertyName("width")]  float Width,
    [property: JsonPropertyName("height")] float Height);

/// <summary>Definition of a game arena with optional wall obstacles.</summary>
public sealed record ArenaDefinition(
    [property: JsonPropertyName("id")]   string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("walls")] ArenaWall[] Walls)
{
    /// <summary>All built-in arenas keyed by id — loaded from shared arenas.json.</summary>
    public static readonly Dictionary<string, ArenaDefinition> All = LoadArenas();

    private static Dictionary<string, ArenaDefinition> LoadArenas()
    {
        // Walk up from the server project to find src/shared/arenas.json
        var dir = AppContext.BaseDirectory;
        string? jsonPath = null;

        // In development (dotnet run / watch), BaseDirectory is bin/Debug/net10.0/
        // Walk up to find the src/shared/ directory
        var current = new DirectoryInfo(dir);
        while (current is not null)
        {
            var candidate = Path.Combine(current.FullName, "src", "shared", "arenas.json");
            if (File.Exists(candidate)) { jsonPath = candidate; break; }
            current = current.Parent;
        }

        if (jsonPath is null)
        {
            // Fallback to embedded defaults if JSON not found (e.g. published single-file)
            return new Dictionary<string, ArenaDefinition>
            {
                ["grassland"] = new("grassland", "Grassland", []),
            };
        }

        var json   = File.ReadAllText(jsonPath);
        var arenas = JsonSerializer.Deserialize<ArenaDefinition[]>(json)
                     ?? [new("grassland", "Grassland", [])];
        return arenas.ToDictionary(a => a.Id);
    }

    /// <summary>Get arena by id, falling back to grassland.</summary>
    public static ArenaDefinition Get(string id) =>
        All.TryGetValue(id, out var arena) ? arena : All["grassland"];

    /// <summary>
    /// Returns true if the circle at (cx, cy) with given radius
    /// collides with any wall in this arena.
    /// </summary>
    public bool CollidesWithWall(float cx, float cy, float radius)
    {
        foreach (var w in Walls)
        {
            float nearX = Math.Clamp(cx, w.X, w.X + w.Width);
            float nearY = Math.Clamp(cy, w.Y, w.Y + w.Height);
            float dx = cx - nearX;
            float dy = cy - nearY;
            if (dx * dx + dy * dy < radius * radius)
                return true;
        }
        return false;
    }
}
