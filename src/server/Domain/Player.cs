namespace PoTagGame.Domain;

/// <summary>
/// Rich domain entity representing a connected player.
/// Immutable invariants are enforced by the GameService (Singleton + lock).
/// </summary>
public sealed class Player
{
    public string Id           { get; set; } = string.Empty;
    public string ConnectionId { get; set; } = string.Empty;
    public string Name         { get; set; } = "Player";
    public int    ColorIdx     { get; set; }

    // ── World position (updated ~20 fps from client) ──────────────────────
    public float X { get; set; } = 640f;
    public float Y { get; set; } = 360f;

    // ── Animation state forwarded verbatim from client ────────────────────
    public string State     { get; set; } = "IDLE";
    public string Direction { get; set; } = "south";

    // ── Tag-game state ────────────────────────────────────────────────────
    public bool   IsIt        { get; set; }
    public double ItSince     { get; set; }   // Unix-ms: when this player became IT
    public double ItDuration  { get; set; }   // Accumulated seconds spent as IT
    public double ImmuneUntil { get; set; }   // Unix-ms: tag immunity expiry
}

/// <summary>
/// Immutable value-object snapshot of a Player, safe for JSON serialisation.
/// Follows the Memento pattern — the hub and background service only ever
/// broadcast these, never the mutable <see cref="Player"/> entities.
/// </summary>
public sealed record PlayerSnapshot(
    string Id,
    string Name,
    int    ColorIdx,
    float  X,
    float  Y,
    string State,
    string Direction,
    bool   IsIt,
    double ItDuration,
    double ImmuneUntil)
{
    /// <summary>Factory method — creates a snapshot from a live entity.</summary>
    public static PlayerSnapshot From(Player p) => new(
        p.Id, p.Name, p.ColorIdx, p.X, p.Y,
        p.State, p.Direction, p.IsIt, p.ItDuration, p.ImmuneUntil);
}
