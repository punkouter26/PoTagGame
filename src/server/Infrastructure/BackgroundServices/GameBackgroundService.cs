using Microsoft.AspNetCore.SignalR;
using TagGame.Domain;
using TagGame.Features.Game;
using TagGame.Features.Lobby;
using TagGame.Features.Replay;
using TagGame.Infrastructure.Hubs;

namespace TagGame.Infrastructure.BackgroundServices;

/// <summary>
/// Hosted background service that drives the game clock at ~1 Hz.
/// - Broadcasts <c>TimeTick</c> every second while a round is in progress.
/// - Fires <c>GameEnded</c> and resets the room when time runs out.
///
/// Uses IHubContext (not the transient Hub instance) because background
/// services are singletons and Hub instances are per-request.
/// </summary>
public sealed class GameBackgroundService : BackgroundService
{
    private readonly IHubContext<TagHub> _hub;
    private readonly GameService         _game;
    private readonly ReplayRecorder      _replay;
    private readonly ILogger<GameBackgroundService> _logger;

    public GameBackgroundService(
        IHubContext<TagHub>                     hub,
        GameService                             game,
        ReplayRecorder                          replay,
        ILogger<GameBackgroundService>          logger)
    {
        _hub    = hub;
        _game   = game;
        _replay = replay;
        _logger = logger;

        _game.RoundEndedByTag += OnRoundEndedByTag;
    }

    public override void Dispose()
    {
        _game.RoundEndedByTag -= OnRoundEndedByTag;
        base.Dispose();
    }

    // ── Tag-touch round-end handler ───────────────────────────────────────

    private void OnRoundEndedByTag(List<PlayerSnapshot> leaderboard)
    {
        // Fire-and-forget: called while GameService lock is held, cannot await here
        _ = HandleRoundEndedByTagAsync(leaderboard);
    }

    private async Task HandleRoundEndedByTagAsync(List<PlayerSnapshot> leaderboard)
    {
        try
        {
            _logger.LogInformation("Round ended by tag — broadcasting GameEnded then restarting");

            await _hub.Clients.All.SendAsync("GameEnded", new GameEndedResponse(leaderboard));

            await Task.Delay(2_000);

            var result = _game.RestartRound();
            if (result is null)
            {
                _logger.LogInformation("RestartRound returned null (no players remain)");
                return;
            }

            var (itId, players, remaining) = result.Value;

            _replay.StartRound(_game.GetArenaId(), itId);

            await _hub.Clients.All.SendAsync(
                "GameStarted",
                new GameStartedResponse(players, itId, remaining, _game.GetArenaId()));

            _logger.LogInformation("New round started after tag; IT={ItId}", itId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error restarting round after tag");
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("GameBackgroundService started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var phase = _game.GetPhase();

                if (phase == GamePhase.Playing)
                {
                    var remaining = _game.GetRemainingSeconds();

                    // Record replay frame every tick (~1 fps)
                    _replay.RecordFrame(_game.GetSnapshot());

                    await _hub.Clients.All.SendAsync(
                        "TimeTick",
                        new TimeTickResponse(remaining),
                        stoppingToken);

                    if (remaining <= 0)
                    {
                        _logger.LogInformation("Round timer expired — ending game");
                        var leaderboard = _game.EndGame();

                        await _hub.Clients.All.SendAsync(
                            "GameEnded",
                            new GameEndedResponse(leaderboard),
                            stoppingToken);

                        // Auto-reset to Lobby so the next player who joins (or
                        // clicks Play Again) doesn't hit the Ended-phase rejection.
                        // A short delay lets clients process GameEnded first.
                        await Task.Delay(3_000, stoppingToken);
                        _game.ResetToLobby();
                        _logger.LogInformation("Room auto-reset to Lobby after round end");

                        var (lobbyPlayers, canStart) = _game.GetLobbyState();
                        await _hub.Clients.All.SendAsync(
                            "LobbyUpdated",
                            new LobbyUpdatedResponse(lobbyPlayers, canStart),
                            stoppingToken);
                    }
                }

                await Task.Delay(1_000, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("GameBackgroundService stopping");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unhandled error in game background loop — continuing");
                await Task.Delay(1_000, stoppingToken);
            }
        }
    }
}
