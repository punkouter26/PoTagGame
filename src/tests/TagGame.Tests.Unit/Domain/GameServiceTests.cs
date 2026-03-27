using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using PoTagGame.Domain;
using PoTagGame.Features.Lobby;
using PoTagGame.Features.Position;
using Xunit;

namespace PoTagGame.Tests.Unit.Domain;

/// <summary>
/// Unit tests for <see cref="GameService"/>.
/// Each test uses a fresh GameService instance (no shared state).
/// </summary>
public sealed class GameServiceTests
{
    // ── Helpers ───────────────────────────────────────────────────────────

    private static GameService Create() =>
        new(NullLogger<GameService>.Instance);

    private static Player AddAndAssert(GameService game, string connId, string name)
    {
        var p = game.AddPlayer(connId, name);
        p.Should().NotBeNull($"AddPlayer({name}) should succeed in a fresh room");
        return p!;
    }

    // ── AddPlayer ─────────────────────────────────────────────────────────

    [Fact]
    public void AddPlayer_InLobby_ReturnsNewPlayer()
    {
        var game   = Create();
        var player = game.AddPlayer("conn1", "Alice");

        player.Should().NotBeNull();
        player!.Name.Should().Be("Alice");
        player.ColorIdx.Should().BeInRange(0, GameRoom.MaxPlayers - 1);
    }

    [Fact]
    public void AddPlayer_TrimsFunkyWhitespace()
    {
        var game   = Create();
        var player = game.AddPlayer("conn1", "  Bob  ");

        player!.Name.Should().Be("Bob");
    }

    [Fact]
    public void AddPlayer_EmptyName_DefaultsToPlayer()
    {
        var game   = Create();
        var player = game.AddPlayer("conn1", "   ");

        player!.Name.Should().Be("Player");
    }

    [Fact]
    public void AddPlayer_TruncatesLongNames()
    {
        var game   = Create();
        var name20 = new string('X', 25);
        var player = game.AddPlayer("conn1", name20);

        player!.Name.Length.Should().BeLessOrEqualTo(20);
    }

    [Fact]
    public void AddPlayer_AssignsUniqueColors()
    {
        var game   = Create();
        var colors = new HashSet<int>();

        for (int i = 0; i < GameRoom.MaxPlayers; i++)
        {
            var p = game.AddPlayer($"conn{i}", $"P{i}");
            p.Should().NotBeNull();
            colors.Add(p!.ColorIdx);
        }

        colors.Count.Should().Be(GameRoom.MaxPlayers);
    }

    [Fact]
    public void AddPlayer_WhenRoomFull_ReturnsNull()
    {
        var game = Create();
        for (int i = 0; i < GameRoom.MaxPlayers; i++)
            game.AddPlayer($"conn{i}", $"P{i}");

        var overflow = game.AddPlayer("connX", "Extra");
        overflow.Should().BeNull();
    }

    [Fact]
    public void AddPlayer_WhileGamePlaying_ReturnsNull()
    {
        var game = Create();
        AddAndAssert(game, "conn1", "Alice");
        game.StartGame();

        var late = game.AddPlayer("conn2", "Late");
        late.Should().BeNull();
    }

    // ── StartGame ─────────────────────────────────────────────────────────

    [Fact]
    public void StartGame_WithOnePlayers_Succeeds_SoloModeAllowed()
    {
        var game = Create();
        AddAndAssert(game, "conn1", "Solo");

        var itId = game.StartGame();

        itId.Should().NotBeNullOrWhiteSpace();
        game.GetPhase().Should().Be(GamePhase.Playing);
    }

    [Fact]
    public void StartGame_WithMultiplePlayers_AssignsExactlyOneIT()
    {
        var game = Create();
        AddAndAssert(game, "conn1", "Alice");
        AddAndAssert(game, "conn2", "Bob");
        AddAndAssert(game, "conn3", "Carol");

        game.StartGame();

        var snapshot = game.GetSnapshot();
        snapshot.Count(p => p.IsIt).Should().Be(1);
    }

    [Fact]
    public void StartGame_WithNoPlayers_ReturnsNull()
    {
        var game = Create();
        var itId = game.StartGame();

        itId.Should().BeNull();
    }

    [Fact]
    public void StartGame_AlreadyPlaying_ReturnsNull()
    {
        var game = Create();
        AddAndAssert(game, "conn1", "Alice");
        game.StartGame(); // first start

        var second = game.StartGame();
        second.Should().BeNull();
    }

    // ── GetLobbyState ─────────────────────────────────────────────────────

    [Fact]
    public void GetLobbyState_WithOnePlayers_CanStartIsTrue()
    {
        var game = Create();
        AddAndAssert(game, "conn1", "Solo");

        var (players, canStart) = game.GetLobbyState();

        canStart.Should().BeTrue();
        players.Should().HaveCount(1);
    }

    [Fact]
    public void GetLobbyState_EmptyRoom_CanStartIsFalse()
    {
        var game = Create();
        var (_, canStart) = game.GetLobbyState();

        canStart.Should().BeFalse();
    }

    // ── RemoveByConnectionId ──────────────────────────────────────────────

    [Fact]
    public void RemoveByConnectionId_ReturnsRemovedPlayer()
    {
        var game   = Create();
        var player = AddAndAssert(game, "conn1", "Alice");

        var removed = game.RemoveByConnectionId("conn1");

        removed.Should().NotBeNull();
        removed!.Id.Should().Be(player.Id);
    }

    [Fact]
    public void RemoveByConnectionId_UnknownConn_ReturnsNull()
    {
        var game    = Create();
        var removed = game.RemoveByConnectionId("unknown");

        removed.Should().BeNull();
    }

    // ── UpdatePosition ────────────────────────────────────────────────────

    [Fact]
    public void UpdatePosition_WhilePlaying_UpdatesSnapshot()
    {
        var game = Create();
        var p    = AddAndAssert(game, "conn1", "Alice");
        game.StartGame();

        game.UpdatePosition("conn1", 300f, 400f, "WALK", "east");

        var snapshot = game.GetSnapshot().Single(s => s.Id == p.Id);
        snapshot.X.Should().Be(300f);
        snapshot.Y.Should().Be(400f);
        snapshot.State.Should().Be("WALK");
        snapshot.Direction.Should().Be("east");
    }

    // ── EndGame ───────────────────────────────────────────────────────────

    [Fact]
    public void EndGame_ReturnsLeaderboardSortedByItTimeAscending()
    {
        var game = Create();
        AddAndAssert(game, "conn1", "Alice");
        AddAndAssert(game, "conn2", "Bob");
        game.StartGame();
        var leaderboard = game.EndGame();

        game.GetPhase().Should().Be(GamePhase.Ended);
        leaderboard.Should().NotBeNull();
        var board = leaderboard!;
        board.Should().NotBeEmpty();
        // Leaderboard order: ascending IT time (lowest = best)
        for (int i = 1; i < board.Count; i++)
            board[i].ItDuration.Should().BeGreaterOrEqualTo(board[i - 1].ItDuration);
    }

    // ── UpdatePositionHandler input validation ────────────────────────────

    [Theory]
    [InlineData(0, 0, "IDLE", "east")]
    [InlineData(1280, 720, "WALK", "west")]
    [InlineData(640, 360, "JUMP", "north")]
    [InlineData(100, 200, "PUNCH", "south")]
    public void UpdatePositionHandler_ValidInput_ReturnsTrue(
        float x, float y, string state, string dir)
    {
        var game    = Create();
        AddAndAssert(game, "conn1", "Alice");
        game.StartGame();

        var handler = new UpdatePositionHandler(game,
            NullLogger<UpdatePositionHandler>.Instance);
        var result = handler.Handle("conn1", new UpdatePositionRequest(x, y, state, dir));

        result.Accepted.Should().BeTrue();
    }

    [Theory]
    [InlineData(0, 0, "FLYING", "east")]   // invalid state
    [InlineData(0, 0, "IDLE", "up")]       // invalid direction
    public void UpdatePositionHandler_InvalidEnum_ReturnsFalse(
        float x, float y, string state, string dir)
    {
        var game    = Create();
        AddAndAssert(game, "conn1", "Alice");
        game.StartGame();

        var handler = new UpdatePositionHandler(game,
            NullLogger<UpdatePositionHandler>.Instance);
        var result = handler.Handle("conn1", new UpdatePositionRequest(x, y, state, dir));

        result.Accepted.Should().BeFalse();
    }
}
