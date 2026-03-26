namespace TagGame.Domain;

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
