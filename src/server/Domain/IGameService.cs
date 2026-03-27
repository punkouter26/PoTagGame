namespace PoTagGame.Domain;

/// <summary>
/// Abstraction over the game service — enables testability and future multi-room support.
/// Implemented by <see cref="GameService"/>.
/// </summary>
public interface IGameService
{
    // ── Queries ───────────────────────────────────────────────────────────
    GamePhase GetPhase();
    int GetRemainingSeconds();
    string GetArenaId();
    List<PlayerSnapshot> GetSnapshot();
    (List<PlayerSnapshot> Players, bool CanStart) GetLobbyState();
    (int CurrentRound, int TotalRounds) GetRoundInfo();

    // ── Mutations ─────────────────────────────────────────────────────────
    Player? AddPlayer(string connectionId, string name);
    Player? RemoveByConnectionId(string connectionId);

    /// <summary>
    /// Applies a position update and checks for tag collisions.
    /// Returns the leaderboard if a tag ended the round; null otherwise.
    /// </summary>
    List<PlayerSnapshot>? UpdatePosition(string connectionId, float x, float y, string state, string direction);

    string? StartGame(string arenaId = "grassland");

    /// <summary>
    /// Ends the game. Returns the leaderboard if the game was actively ended,
    /// or null if it was already in Ended phase (idempotent guard).
    /// </summary>
    List<PlayerSnapshot>? EndGame();

    void ResetToLobby();
    (string ItId, List<PlayerSnapshot> Players, int Remaining)? RestartRound();

    /// <summary>
    /// Returns true and consumes the flag if a tag ended the last round
    /// and a restart is pending. Called by the background service.
    /// </summary>
    bool ConsumePendingRestart();
}
