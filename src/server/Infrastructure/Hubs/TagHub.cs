using Microsoft.AspNetCore.SignalR;
using TagGame.Domain;
using TagGame.Features.Game;
using TagGame.Features.Lobby;
using TagGame.Features.Position;

namespace TagGame.Infrastructure.Hubs;

/// <summary>
/// SignalR hub — the real-time WebSocket bridge between clients and the server.
///
/// Responsibilities (Single Responsibility):
///   - Route incoming SignalR calls to the appropriate Feature Handler
///   - Broadcast server-initiated events (tag, timer, game end)
///   - Handle connection lifecycle (join / disconnect)
///
/// The hub deliberately contains NO business logic — it delegates to feature
/// handlers that are testable independently of SignalR.
///
/// Client → Server methods:  JoinLobby, UpdatePosition, StartGame
/// Server → Client methods:  Joined, LobbyUpdated, GameStarted, StateUpdated,
///                           TimeTick, GameEnded, Error
/// </summary>
public sealed class TagHub : Hub
{
    private readonly IGameService            _game;
    private readonly JoinLobbyHandler       _joinLobby;
    private readonly StartGameHandler       _startGame;
    private readonly UpdatePositionHandler  _updatePosition;
    private readonly ILogger<TagHub>        _logger;

    public TagHub(
        IGameService          game,
        JoinLobbyHandler      joinLobby,
        StartGameHandler      startGame,
        UpdatePositionHandler updatePosition,
        ILogger<TagHub>       logger)
    {
        _game           = game;
        _joinLobby      = joinLobby;
        _startGame      = startGame;
        _updatePosition = updatePosition;
        _logger         = logger;
    }

    // ── Connection lifecycle ──────────────────────────────────────────────

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (exception is not null)
        {
            _logger.LogError(exception,
                "Client {ConnId} disconnected with error", Context.ConnectionId);
        }
        else
        {
            _logger.LogInformation("Client {ConnId} disconnected cleanly", Context.ConnectionId);
        }

        var removed = _game.RemoveByConnectionId(Context.ConnectionId);
        if (removed is not null)
        {
            var phase = _game.GetPhase();

            if (phase == GamePhase.Ended)
            {
                await Clients.All.SendAsync("GameEnded",
                    new GameEndedResponse(_game.GetSnapshot()));
            }
            else
            {
                await BroadcastLobbyAsync();
                if (phase == GamePhase.Playing)
                {
                    await BroadcastStateAsync();
                }
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    // ── Client → Server ───────────────────────────────────────────────────

    /// <summary>Called once when the player submits their name on the lobby screen.</summary>
    public async Task JoinLobby(string name)
    {
        _logger.LogDebug("JoinLobby: connId={ConnId} name={Name}", Context.ConnectionId, name);

        var player = _joinLobby.Handle(Context.ConnectionId, new JoinLobbyRequest(name));

        if (player is null)
        {
            var phase = _game.GetPhase();
            var message = phase == GamePhase.Playing
                ? "A game is in progress — you'll be able to join when it ends."
                : phase == GamePhase.Ended
                ? "The round just ended — the lobby will reopen momentarily."
                : "Cannot join: the lobby is full (max 8 players).";
            await Clients.Caller.SendAsync("Error", new { message });
            return;
        }

        await Clients.Caller.SendAsync("Joined",
            new JoinedResponse(player.Id, player.ColorIdx));

        await BroadcastLobbyAsync();
    }

    /// <summary>Called ~20 fps with latest position and animation state.</summary>
    public async Task UpdatePosition(float x, float y, string state, string direction)
    {
        if (_game.GetPhase() != GamePhase.Playing) return;

        var (accepted, tagLeaderboard) = _updatePosition.Handle(
            Context.ConnectionId,
            new UpdatePositionRequest(x, y, state, direction));

        if (!accepted) return;

        // A tag ended the round \u2014 broadcast immediately from the hub thread
        if (tagLeaderboard is not null)
        {
            var (round, total) = _game.GetRoundInfo();
            if (round >= total)
            {
                await Clients.All.SendAsync("GameEnded", new GameEndedResponse(tagLeaderboard));
            }
            else
            {
                await Clients.All.SendAsync("RoundEnded", new RoundEndedResponse(tagLeaderboard, round, total));
            }
            return;
        }

        await BroadcastStateAsync();
    }

    /// <summary>Any connected player can trigger this once ≥1 are in the lobby.</summary>
    public async Task StartGame(string arenaId = "grassland")
    {
        _logger.LogDebug("StartGame: connId={ConnId} arena={ArenaId}", Context.ConnectionId, arenaId);

        var response = _startGame.Handle(arenaId);
        if (response is null)
        {
            await Clients.Caller.SendAsync("Error",
                new { message = "Cannot start: no players in lobby or game already running." });
            return;
        }

        await Clients.All.SendAsync("GameStarted", response);
    }


    // ── Helpers ───────────────────────────────────────────────────────────

    private Task BroadcastLobbyAsync()
    {
        var state = _joinLobby.BuildLobbyState();
        return Clients.All.SendAsync("LobbyUpdated", state);
    }

    private Task BroadcastStateAsync() =>
        Clients.All.SendAsync("StateUpdated",
            new StateUpdatedResponse(_game.GetSnapshot()));
}
