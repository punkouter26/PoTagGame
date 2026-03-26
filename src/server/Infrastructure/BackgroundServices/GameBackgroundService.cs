using Microsoft.AspNetCore.SignalR;
using TagGame.Domain;
using TagGame.Features.Game;
using TagGame.Features.Lobby;
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
    private readonly IGameService        _game;
    private readonly ILogger<GameBackgroundService> _logger;

    public GameBackgroundService(
        IHubContext<TagHub>                     hub,
        IGameService                            game,
        ILogger<GameBackgroundService>          logger)
    {
        _hub    = hub;
        _game   = game;
        _logger = logger;
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

                    await _hub.Clients.All.SendAsync(
                        "TimeTick",
                        new TimeTickResponse(remaining),
                        stoppingToken);

                    if (remaining <= 0)
                    {
                        _logger.LogInformation("Round timer expired — ending round");
                        var leaderboard = _game.EndGame();

                        if (leaderboard is not null)
                        {
                            var (round, total) = _game.GetRoundInfo();
                            if (round >= total)
                            {
                                // Session complete — final leaderboard
                                await _hub.Clients.All.SendAsync(
                                    "GameEnded",
                                    new GameEndedResponse(leaderboard),
                                    stoppingToken);

                                await Task.Delay(8_000, stoppingToken);
                                _game.ResetToLobby();
                                _logger.LogInformation("Session complete — room reset to Lobby");

                                var (lobbyPlayers, canStart) = _game.GetLobbyState();
                                await _hub.Clients.All.SendAsync(
                                    "LobbyUpdated",
                                    new LobbyUpdatedResponse(lobbyPlayers, canStart),
                                    stoppingToken);
                            }
                            else
                            {
                                // Mid-session round end — brief pause then next round
                                await _hub.Clients.All.SendAsync(
                                    "RoundEnded",
                                    new RoundEndedResponse(leaderboard, round, total),
                                    stoppingToken);

                                await Task.Delay(3_000, stoppingToken);
                                var result = _game.RestartRound();
                                if (result is not null)
                                {
                                    var (itId, players, nextRemaining) = result.Value;
                                    var (r2, t2) = _game.GetRoundInfo();
                                    await _hub.Clients.All.SendAsync(
                                        "GameStarted",
                                        new GameStartedResponse(players, itId, nextRemaining, _game.GetArenaId(), r2, t2),
                                        stoppingToken);
                                    _logger.LogInformation("Round {Round}/{Total} started after timer; IT={ItId}", r2, t2, itId);
                                }
                            }
                        }
                    }
                }

                // ── Tag-based round restart ───────────────────────────────────
                // CheckTags (running on a hub thread) sets a flag when a tag ends
                // the round.  We pick it up here to restart after a short delay,
                // completely outside the GameService lock.
                if (_game.ConsumePendingRestart())
                {
                    var (round, total) = _game.GetRoundInfo();
                    if (round >= total)
                    {
                        // Session over — TagHub already broadcast GameEnded
                        _logger.LogInformation("Session complete after tag — resetting to Lobby");
                        await Task.Delay(8_000, stoppingToken);
                        _game.ResetToLobby();

                        var (lobbyPlayers, canStart) = _game.GetLobbyState();
                        await _hub.Clients.All.SendAsync(
                            "LobbyUpdated",
                            new LobbyUpdatedResponse(lobbyPlayers, canStart),
                            stoppingToken);
                    }
                    else
                    {
                        // More rounds — TagHub already broadcast RoundEnded
                        _logger.LogInformation("Tag restart pending — waiting 3 s then starting round");
                        await Task.Delay(3_000, stoppingToken);

                        var result = _game.RestartRound();
                        if (result is not null)
                        {
                            var (itId, players, remaining) = result.Value;
                            var (r2, t2) = _game.GetRoundInfo();

                            await _hub.Clients.All.SendAsync(
                                "GameStarted",
                                new GameStartedResponse(players, itId, remaining, _game.GetArenaId(), r2, t2),
                                stoppingToken);

                            _logger.LogInformation("Round {Round}/{Total} started after tag; IT={ItId}", r2, t2, itId);
                        }
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
