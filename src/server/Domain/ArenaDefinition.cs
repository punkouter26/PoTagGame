namespace TagGame.Domain;

/// <summary>Rectangular wall obstacle in an arena.</summary>
public sealed record ArenaWall(float X, float Y, float Width, float Height);

/// <summary>Definition of a game arena with optional wall obstacles.</summary>
public sealed record ArenaDefinition(string Id, string Name, ArenaWall[] Walls)
{
    /// <summary>All built-in arenas keyed by id.</summary>
    public static readonly Dictionary<string, ArenaDefinition> All = new()
    {
        ["grassland"] = new("grassland", "Grassland", []),
        ["dungeon"] = new("dungeon", "Dungeon",
        [
            new(540, 280, 60, 60), new(680, 380, 60, 60),
            new(100, 80, 160, 40),   new(100, 80, 40, 160),
            new(1020, 80, 160, 40),  new(1140, 80, 40, 160),
            new(100, 600, 160, 40),  new(100, 480, 40, 160),
            new(1020, 600, 160, 40), new(1140, 480, 40, 160),
            new(380, 180, 40, 160),  new(860, 180, 40, 160),
            new(380, 380, 40, 160),  new(860, 380, 40, 160),
        ]),
        ["rooftop"] = new("rooftop", "Rooftop",
        [
            new(440, 400, 400, 40),
            new(150, 200, 200, 30),  new(150, 200, 30, 150),
            new(930, 200, 200, 30),  new(1100, 200, 30, 150),
            new(150, 500, 200, 30),  new(150, 500, 30, 120),
            new(930, 500, 200, 30),  new(1100, 500, 30, 120),
            new(600, 150, 80, 30),   new(600, 540, 80, 30),
        ]),
    };

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
            // Closest point on the wall rect to the circle centre
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
