using PoTagGame.Domain;

namespace PoTagGame.Features.Game;

// ── DTOs ─────────────────────────────────────────────────────────────────────

/// <summary>Server → All: game has started; contains initial positions + IT assignment.</summary>
public sealed record GameStartedResponse(
    List<PlayerSnapshot> Players,
    string ItId,
    int RemainingSeconds,
    string ArenaId,
    int CurrentRound,
    int TotalRounds);

/// <summary>Server → All: full room snapshot sent each position-update cycle.</summary>
public sealed record StateUpdatedResponse(List<PlayerSnapshot> Players);

/// <summary>Server → All: periodic countdown tick.</summary>
public sealed record TimeTickResponse(int RemainingSeconds);

/// <summary>Server → All: round has ended; leaderboard sorted ascending by IT time.</summary>
public sealed record GameEndedResponse(List<PlayerSnapshot> Leaderboard);

/// <summary>Server → All: a round ended mid-session; more rounds to play.</summary>
public sealed record RoundEndedResponse(
    List<PlayerSnapshot> Leaderboard,
    int CurrentRound,
    int TotalRounds);

// ── Feature Handler ───────────────────────────────────────────────────────────

/// <summary>Encapsulates the StartGame use-case.</summary>
public sealed class StartGameHandler(IGameService game, ILogger<StartGameHandler> logger)
{
    /// <summary>
    /// Starts the game if at least 1 player is in the lobby (solo mode allowed).
    /// Returns the started response payload, or null if start was not permitted.
    /// </summary>
    public GameStartedResponse? Handle(string arenaId = "grassland")
    {
        logger.LogDebug("StartGame requested with arena={ArenaId}", arenaId);

        var itId = game.StartGame(arenaId);
        if (itId is null)
        {
            logger.LogWarning("StartGame failed — not in lobby phase or no players");
            return null;
        }

        var response = new GameStartedResponse(
            game.GetSnapshot(),
            itId,
            game.GetRemainingSeconds(),
            game.GetArenaId(),
            game.GetRoundInfo().CurrentRound,
            game.GetRoundInfo().TotalRounds);

        logger.LogInformation("StartGame succeeded; IT={ItId}; players={Count}",
            itId, response.Players.Count);

        return response;
    }
}
