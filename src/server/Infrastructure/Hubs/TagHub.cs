using Microsoft.AspNetCore.SignalR;
using TagGame.Domain;
using TagGame.Features.Game;
using TagGame.Features.Lobby;
using TagGame.Features.Position;
using TagGame.Features.Replay;
using TagGame.Features.Tag;

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
///                           Tagged, TimeTick, GameEnded, Error
/// </summary>
public sealed class TagHub : Hub
{
    private readonly GameService            _game;
    private readonly JoinLobbyHandler       _joinLobby;
    private readonly StartGameHandler       _startGame;
    private readonly UpdatePositionHandler  _updatePosition;
    private readonly ReplayRecorder         _replay;
    private readonly ILogger<TagHub>        _logger;

    public TagHub(
        GameService           game,
        JoinLobbyHandler      joinLobby,
        StartGameHandler      startGame,
        UpdatePositionHandler updatePosition,
        ReplayRecorder        replay,
        ILogger<TagHub>       logger)
    {
        _game           = game;
        _joinLobby      = joinLobby;
        _startGame      = startGame;
        _updatePosition = updatePosition;
        _replay         = replay;
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

        // If rejected because a game is already running (not because room is full),
        // reset back to lobby so the new player — and any in-progress players — can all join.
        if (player is null)
        {
            var phase = _game.GetPhase();
            if (phase == GamePhase.Playing || phase == GamePhase.Ended)
            {
                _logger.LogInformation(
                    "JoinLobby: 2nd player joining while game {Phase} — resetting to lobby",
                    phase);
                _game.ResetToLobby();
                player = _joinLobby.Handle(Context.ConnectionId, new JoinLobbyRequest(name));
            }
        }

        if (player is null)
        {
            await Clients.Caller.SendAsync("Error",
                new { message = "Cannot join: lobby is full." });
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

        var accepted = _updatePosition.Handle(
            Context.ConnectionId,
            new UpdatePositionRequest(x, y, state, direction));

        if (!accepted) return;

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

        _replay.StartRound(response.ArenaId, response.ItId);

        await Clients.All.SendAsync("GameStarted", response);
    }

    /// <summary>Client requests the last round's replay data.</summary>
    public async Task GetReplay()
    {
        var data = _replay.GetReplay();
        await Clients.Caller.SendAsync("ReplayData", data);
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
