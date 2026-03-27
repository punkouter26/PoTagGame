namespace PoTagGame.Domain;

/// <summary>
/// Represents the phase of a single game room.
/// Follows the State pattern: callers branch on this to decide valid transitions.
/// </summary>
public enum GamePhase { Lobby, Playing, Ended }

/// <summary>
/// Aggregate root for the single-room game state.
/// GameService is responsible for keeping this consistent under a lock.
/// </summary>
public sealed class GameRoom
{
    public const int    MaxPlayers      = 8;
    public const int    RoundDurationMs = 40_000; // 40 seconds per round
    public const float  TagRadius       = 40f;
    public const double ImmunityMs      = 2_000.0;

    public GamePhase Phase        { get; set; } = GamePhase.Lobby;
    public long      RoundStartMs { get; set; }
    public string    ArenaId      { get; set; } = "grassland";
    public int       CurrentRound { get; set; }
    public int       TotalRounds  { get; set; } = 3;

    /// <summary>All players keyed by their generated id (not connection id).</summary>
    public Dictionary<string, Player> Players { get; } = new();

    /// <summary>Calculate total rounds: max(3, 6 - playerCount) — fewer players = more rounds.</summary>
    public static int CalculateRounds(int playerCount) =>
        Math.Max(3, 6 - playerCount);

    /// <summary>
    /// Seconds remaining in the current round; 0 once time has elapsed.
    /// </summary>
    public int RemainingSeconds()
    {
        if (Phase != GamePhase.Playing) return 0;
        var elapsedMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - RoundStartMs;
        var remaining = (RoundDurationMs - elapsedMs) / 1000.0;
        return (int)Math.Max(0, Math.Ceiling(remaining));
    }
}
