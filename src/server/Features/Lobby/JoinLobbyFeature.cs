using TagGame.Domain;

namespace TagGame.Features.Lobby;

// ── Request / Response DTOs ───────────────────────────────────────────────────

/// <summary>Client → Server: player submits their display name.</summary>
public sealed record JoinLobbyRequest(string Name);

/// <summary>Server → Client: sent to the joining player with their assigned identity.</summary>
public sealed record JoinedResponse(string PlayerId, int ColorIdx);

/// <summary>Server → All: current lobby roster + whether the game can be started.</summary>
public sealed record LobbyUpdatedResponse(List<PlayerSnapshot> Players, bool CanStart);

// ── Feature Handler ───────────────────────────────────────────────────────────

/// <summary>
/// Encapsulates the JoinLobby use-case (VSA: one class per feature).
/// The hub delegates to this handler to keep the hub thin.
/// </summary>
public sealed class JoinLobbyHandler(GameService game, ILogger<JoinLobbyHandler> logger)
{
    /// <summary>
    /// Processes a join request.
    /// Returns the new Player on success, null if the room is full/in-progress (hub sends error).
    /// </summary>
    public Player? Handle(string connectionId, JoinLobbyRequest request)
    {
        logger.LogDebug("JoinLobby requested by connectionId={ConnId} name={Name}",
            connectionId, request.Name);

        var player = game.AddPlayer(connectionId, request.Name);

        if (player is null)
        {
            logger.LogWarning(
                "JoinLobby failed for connectionId={ConnId} — room full or not in lobby phase",
                connectionId);
        }

        return player;
    }

    /// <summary>Builds the lobby-updated payload visible to all clients.</summary>
    public LobbyUpdatedResponse BuildLobbyState()
    {
        var (players, canStart) = game.GetLobbyState();
        return new LobbyUpdatedResponse(players, canStart);
    }
}
