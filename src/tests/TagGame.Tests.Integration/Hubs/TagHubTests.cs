using System.Net;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using TagGame.Domain;
using TagGame.Features.Lobby;
using TagGame.Features.Game;
using Xunit;

namespace TagGame.Tests.Integration.Hubs;

/// <summary>
/// Integration tests for TagHub using a real in-process SignalR server.
/// WebApplicationFactory starts the full ASP.NET Core pipeline (including SignalR)
/// in memory, so no external port is needed.
/// </summary>
public sealed class TagHubTests : IAsyncLifetime
{
    // ── Factory ───────────────────────────────────────────────────────────

    private readonly WebApplicationFactory<Program> _factory;

    public TagHubTests()
    {
        // Disable the background service in integration tests to avoid timer noise
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    // Remove the background service so tests aren't polluted by
                    // timed "GameEnded" broadcasts firing during test execution
                    var descriptor = services.SingleOrDefault(
                        d => d.ImplementationType == typeof(TagGame.Infrastructure.BackgroundServices.GameBackgroundService));
                    if (descriptor is not null) services.Remove(descriptor);
                });
            });
    }

    public Task InitializeAsync() => Task.CompletedTask;
    public async Task DisposeAsync() => await _factory.DisposeAsync();

    // ── Helper ────────────────────────────────────────────────────────────

    private HubConnection BuildConnection()
    {
        var httpClient = _factory.CreateClient();
        return new HubConnectionBuilder()
            .WithUrl("http://localhost/tagHub", opts =>
            {
                // Use the in-process handler provided by WebApplicationFactory
                opts.HttpMessageHandlerFactory = _ => _factory.Server.CreateHandler();
            })
            .Build();
    }

    // ── Tests ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task JoinLobby_Returns_Joined_And_LobbyUpdated()
    {
        await using var conn = BuildConnection();

        string?  playerId  = null;
        GameRoomListResponse? lobbyState = null;

        conn.On<JoinedResponse>("Joined", r =>
        {
            playerId = r.PlayerId;
        });

        conn.On<LobbyUpdatedResponse>("LobbyUpdated", r =>
        {
            lobbyState = new GameRoomListResponse(r.Players, r.CanStart);
        });

        await conn.StartAsync();
        await conn.InvokeAsync("JoinLobby", "TestPlayer");

        await Task.Delay(200); // allow callbacks to fire

        playerId.Should().NotBeNullOrWhiteSpace();
        lobbyState.Should().NotBeNull();
        lobbyState!.Players.Should().ContainSingle(p => p.Name == "TestPlayer");
        lobbyState.CanStart.Should().BeTrue("single player should be enough to start");
    }

    [Fact]
    public async Task StartGame_WithOnePlayers_Broadcasts_GameStarted()
    {
        await using var conn = BuildConnection();

        GameStartedResponse? started = null;
        conn.On<GameStartedResponse>("GameStarted", r => started = r);

        await conn.StartAsync();
        await conn.InvokeAsync("JoinLobby", "Solo");
        await conn.InvokeAsync("StartGame", "grassland");

        await Task.Delay(200);

        started.Should().NotBeNull();
        started!.Players.Should().ContainSingle();
        started.ItId.Should().NotBeNullOrWhiteSpace();
        started.RemainingSeconds.Should().Be(120);
    }

    [Fact]
    public async Task StartGame_WithNoPlayers_Sends_Error()
    {
        await using var conn = BuildConnection();

        object? error = null;
        conn.On<object>("Error", r => error = r);

        await conn.StartAsync();
        await conn.InvokeAsync("StartGame", "grassland");

        await Task.Delay(200);

        error.Should().NotBeNull();
    }

    [Fact]
    public async Task UpdatePosition_WhilePlaying_Broadcasts_StateUpdated()
    {
        await using var conn = BuildConnection();

        GameStartedResponse? started      = null;
        object?              stateUpdated = null;

        conn.On<GameStartedResponse>("GameStarted", r => started = r);
        conn.On<object>("StateUpdated", r => stateUpdated = r);

        await conn.StartAsync();
        await conn.InvokeAsync("JoinLobby", "Mover");
        await conn.InvokeAsync("StartGame", "grassland");

        await Task.Delay(200);
        started.Should().NotBeNull();

        await conn.InvokeAsync("UpdatePosition", 300f, 400f, "WALK", "east");
        await Task.Delay(200);

        stateUpdated.Should().NotBeNull();
    }

    // ── Helper DTO used in this test class only ───────────────────────────

    private sealed record GameRoomListResponse(List<PlayerSnapshot> Players, bool CanStart);
}
