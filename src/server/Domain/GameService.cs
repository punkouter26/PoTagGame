namespace TagGame.Domain;

/// <summary>
/// Thread-safe singleton that owns the single game room.
///
/// Design: Strategy pattern for tag-radius checking; Observer pattern via
/// the <see cref="TagOccurred"/> event that allows the hub to react without
/// coupling GameService → SignalR directly.
///
/// All mutating methods acquire <see cref="_lock"/> to ensure safe concurrent
/// access from multiple SignalR connection threads.
/// </summary>
public sealed class GameService
{
    // ── Constants / spawn configuration ──────────────────────────────────
    private static readonly (float X, float Y)[] Spawns =
    [
        (640, 360),   // center — friendly for solo play and first spawn
        (200, 200), (1080, 200), (200, 520), (1080, 520),
        (640, 150), (640,  570), (150, 360), (1130, 360),
    ];

    private readonly object   _lock = new();
    private readonly GameRoom _room = new();
    private readonly ILogger<GameService> _logger;

    // ── Observer: raised when a tag touch ends the round ──────────────────
    /// <summary>Raised when a player is tagged, ending the round immediately.</summary>
    public event Action<List<PlayerSnapshot>>? RoundEndedByTag;

    /// <summary>Tracks which player becomes IT for the next round (set by CheckTags).</summary>
    private string? _pendingItId;

    public GameService(ILogger<GameService> logger)
    {
        _logger = logger;
    }

    // ── Queries (snapshot-safe) ───────────────────────────────────────────

    public GamePhase GetPhase()
    {
        lock (_lock) { return _room.Phase; }
    }

    public int GetRemainingSeconds()
    {
        lock (_lock) { return _room.RemainingSeconds(); }
    }

    public string GetArenaId()
    {
        lock (_lock) { return _room.ArenaId; }
    }

    /// <summary>Returns a JSON-safe snapshot list; acquires lock internally.</summary>
    public List<PlayerSnapshot> GetSnapshot()
    {
        lock (_lock)
        {
            return _room.Players.Values.Select(PlayerSnapshot.From).ToList();
        }
    }

    /// <summary>
    /// Returns lobby player list and whether 1+ players present (solo mode allowed).
    /// Per spec: a single player may start the game and run around alone.
    /// </summary>
    public (List<PlayerSnapshot> Players, bool CanStart) GetLobbyState()
    {
        lock (_lock)
        {
            var players  = _room.Players.Values.Select(PlayerSnapshot.From).ToList();
            // canStart = at least 1 player in lobby
            var canStart = _room.Phase == GamePhase.Lobby && players.Count >= 1;
            return (players, canStart);
        }
    }

    // ── Mutations ─────────────────────────────────────────────────────────

    /// <summary>
    /// Adds a player to the lobby.
    /// Returns the created Player, or null if the room is full / in-progress.
    /// </summary>
    public Player? AddPlayer(string connectionId, string name)
    {
        lock (_lock)
        {
            if (_room.Phase != GamePhase.Lobby)
            {
                _logger.LogDebug("AddPlayer skipped: room phase is {Phase}", _room.Phase);
                return null;
            }
            if (_room.Players.Count >= GameRoom.MaxPlayers)
            {
                _logger.LogWarning("AddPlayer rejected: lobby full ({Count}/{Max})",
                    _room.Players.Count, GameRoom.MaxPlayers);
                return null;
            }

            var usedColors = _room.Players.Values.Select(p => p.ColorIdx).ToHashSet();
            int colorIdx   = Enumerable.Range(0, GameRoom.MaxPlayers)
                                       .First(i => !usedColors.Contains(i));

            var spawn  = Spawns[_room.Players.Count % Spawns.Length];
            var player = new Player
            {
                Id           = Guid.NewGuid().ToString("N")[..8],
                ConnectionId = connectionId,
                Name         = SanitiseName(name),
                ColorIdx     = colorIdx,
                X            = spawn.X,
                Y            = spawn.Y,
            };

            _room.Players[player.Id] = player;
            _logger.LogInformation("Player {Name} ({Id}) added; lobby size={Count}",
                player.Name, player.Id, _room.Players.Count);
            return player;
        }
    }

    /// <summary>
    /// Removes a player by SignalR connection id.
    /// Handles mid-game IT reassignment and early-end detection.
    /// Returns the removed player (or null if not found).
    /// </summary>
    public Player? RemoveByConnectionId(string connectionId)
    {
        lock (_lock)
        {
            var player = _room.Players.Values
                              .FirstOrDefault(p => p.ConnectionId == connectionId);
            if (player is null) return null;

            _room.Players.Remove(player.Id);
            _logger.LogInformation("Player {Name} ({Id}) removed; remaining={Count}",
                player.Name, player.Id, _room.Players.Count);

            if (_room.Phase == GamePhase.Playing)
            {
                // IT left — assign to next survivor (if any)
                if (player.IsIt && _room.Players.Count > 0)
                {
                    var survivor = _room.Players.Values.First();
                    BecomeIt(survivor);
                    _logger.LogInformation("IT reassigned to {Name} after disconnect", survivor.Name);
                }

                // Solo player remains — end immediately (no one to tag)
                if (_room.Players.Count == 0)
                {
                    _logger.LogInformation("All players left mid-game; ending round");
                    EndGameLocked();
                }
            }

            return player;
        }
    }

    /// <summary>
    /// Called ~20 fps by each client with their current world position.
    /// Updates state and checks for proximity-based tag collisions.
    /// </summary>
    public void UpdatePosition(string connectionId, float x, float y, string state, string direction)
    {
        lock (_lock)
        {
            var p = FindByConnId(connectionId);
            if (p is null) return;

            // Validate against arena walls — if new position collides, keep old position
            var arena = ArenaDefinition.Get(_room.ArenaId);
            if (!arena.CollidesWithWall(x, y, 16f))
            {
                p.X = x;
                p.Y = y;
            }

            p.State     = state;
            p.Direction = direction;

            if (_room.Phase == GamePhase.Playing) CheckTags(p);
        }
    }

    /// <summary>
    /// Starts the game if ≥1 player is in the lobby.
    /// Solo mode: the single player is assigned IT and the round timer starts.
    /// Returns the IT player id, or null if the game could not start.
    /// </summary>
    public string? StartGame(string arenaId = "grassland")
    {
        lock (_lock)
        {
            if (_room.Phase != GamePhase.Lobby) return null;
            if (_room.Players.Count < 1) return null;

            _room.ArenaId = ArenaDefinition.All.ContainsKey(arenaId) ? arenaId : "grassland";

            foreach (var p in _room.Players.Values)
            {
                p.ItDuration  = 0;
                p.IsIt        = false;
                p.ImmuneUntil = 0;
            }

            var players = _room.Players.Values.ToArray();
            for (int i = 0; i < players.Length; i++)
            {
                var sp = Spawns[i % Spawns.Length];
                players[i].X = sp.X;
                players[i].Y = sp.Y;
            }

            var it = players[Random.Shared.Next(players.Length)];
            BecomeIt(it);

            _room.Phase        = GamePhase.Playing;
            _room.RoundStartMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            _logger.LogInformation("Game started; playerCount={Count}; IT={Name}",
                players.Length, it.Name);
            return it.Id;
        }
    }

    /// <summary>Ends the game, finalises IT times, returns sorted leaderboard.</summary>
    public List<PlayerSnapshot> EndGame()
    {
        lock (_lock) { return EndGameLocked(); }
    }

    /// <summary>Resets the room back to Lobby so players can play again.</summary>
    public void ResetToLobby()
    {
        lock (_lock)
        {
            _room.Phase        = GamePhase.Lobby;
            _room.RoundStartMs = 0;
            foreach (var p in _room.Players.Values)
            {
                p.IsIt        = false;
                p.ItDuration  = 0;
                p.ImmuneUntil = 0;
                p.ItSince     = 0;
            }
            _logger.LogInformation("Room reset to Lobby");
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────

    private List<PlayerSnapshot> EndGameLocked()
    {
        // Idempotent guard: if already ended (e.g. timer and tag race), return current state.
        if (_room.Phase == GamePhase.Ended)
        {
            return _room.Players.Values
                .OrderBy(p => p.ItDuration)
                .Select(PlayerSnapshot.From)
                .ToList();
        }

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        foreach (var p in _room.Players.Values)
        {
            if (p.IsIt && p.ItSince > 0)
            {
                p.ItDuration += (nowMs - p.ItSince) / 1_000.0;
                p.IsIt        = false;
            }
        }
        _room.Phase = GamePhase.Ended;

        var leaderboard = _room.Players.Values
            .OrderBy(p => p.ItDuration)
            .Select(PlayerSnapshot.From)
            .ToList();

        _logger.LogInformation("Game ended; winner={Name}", leaderboard.FirstOrDefault()?.Name ?? "none");
        return leaderboard;
    }

    /// <summary>
    /// Proximity tag check — called on every position update while playing.
    /// When IT touches a player the round ends immediately; the touched player
    /// becomes IT for the next round.  Must be called while <see cref="_lock"/> is held.
    /// </summary>
    private void CheckTags(Player mover)
    {
        if (!mover.IsIt) return;

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (nowMs < mover.ImmuneUntil) return;

        foreach (var target in _room.Players.Values)
        {
            if (target.Id == mover.Id) continue;
            if (nowMs < target.ImmuneUntil) continue;

            var dx   = mover.X - target.X;
            var dy   = mover.Y - target.Y;
            var dist = MathF.Sqrt(dx * dx + dy * dy);

            if (dist <= GameRoom.TagRadius)
            {
                _logger.LogInformation("Tag: {OldIt} touched {Target} (dist={Dist:F1}px) — ending round",
                    mover.Name, target.Name, dist);

                // Remember who becomes IT next round (the player who was tagged)
                _pendingItId = target.Id;

                // End the round and notify the background service to handle restart
                var leaderboard = EndGameLocked();
                RoundEndedByTag?.Invoke(leaderboard);
                return;
            }
        }
    }

    /// <summary>
    /// Repositions all players on opposite sides of the canvas and starts a fresh round.
    /// IT (the player who was tagged) spawns right-side; everyone else spawns left-side.
    /// Returns the startup payload, or null if no players remain.
    /// </summary>
    public (string ItId, List<PlayerSnapshot> Players, int Remaining)? RestartRound()
    {
        lock (_lock)
        {
            if (_room.Players.Count == 0) return null;

            var players = _room.Players.Values.ToArray();

            // Determine new IT: player who was tagged, else random
            var newIt = (_pendingItId is not null
                         && _room.Players.TryGetValue(_pendingItId, out var pending))
                        ? pending
                        : players[Random.Shared.Next(players.Length)];
            _pendingItId = null;

            // Reset all players
            foreach (var p in players)
            {
                p.IsIt        = false;
                p.ItDuration  = 0;
                p.ImmuneUntil = 0;
                p.ItSince     = 0;
            }

            // IT spawns right-center; non-IT players spread on left side
            newIt.X = 1080f;
            newIt.Y = 360f;

            var nonIt = players.Where(p => p.Id != newIt.Id).ToArray();
            float[] ys = [180f, 300f, 420f, 540f];
            for (int i = 0; i < nonIt.Length; i++)
            {
                nonIt[i].X = 200f;
                nonIt[i].Y = nonIt.Length == 1 ? 360f : ys[i % ys.Length];
            }

            BecomeIt(newIt);

            _room.Phase        = GamePhase.Playing;
            _room.RoundStartMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            _logger.LogInformation("Round restarted; IT={Name}; players={Count}",
                newIt.Name, players.Length);

            var snapshot = _room.Players.Values.Select(PlayerSnapshot.From).ToList();
            return (newIt.Id, snapshot, _room.RemainingSeconds());
        }
    }

    /// <summary>Assigns IT to <paramref name="player"/>, recording the start time.</summary>
    private static void BecomeIt(Player player)
    {
        player.IsIt        = true;
        player.ItSince     = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        player.ImmuneUntil = player.ItSince + GameRoom.ImmunityMs;
    }

    private Player? FindByConnId(string connId) =>
        _room.Players.Values.FirstOrDefault(p => p.ConnectionId == connId);

    /// <summary>Trims and truncates player names; prevents XSS via HTML injection.</summary>
    private static string SanitiseName(string raw)
    {
        var trimmed = raw.Trim();
        return trimmed.Length > 20 ? trimmed[..20] : trimmed.Length == 0 ? "Player" : trimmed;
    }
}
