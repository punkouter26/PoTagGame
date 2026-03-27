namespace PoTagGame.Domain;

/// <summary>
/// Thread-safe singleton that owns the single game room.
///
/// Design: Strategy pattern for tag-radius checking; polling pattern via
/// <see cref="ConsumePendingRestart"/> so the background service can react
/// without coupling GameService → SignalR directly.
///
/// All mutating methods acquire <see cref="_lock"/> to ensure safe concurrent
/// access from multiple SignalR connection threads.
/// </summary>
public sealed class GameService : IGameService
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

    /// <summary>Tracks which player becomes IT for the next round (set by CheckTags).</summary>
    private string? _pendingItId;

    /// <summary>Set by CheckTags when a tag ends the round; consumed by the background service.</summary>
    private bool _pendingRestart;

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

    public (int CurrentRound, int TotalRounds) GetRoundInfo()
    {
        lock (_lock) { return (_room.CurrentRound, _room.TotalRounds); }
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

            var baseName = SanitiseName(name);
            var uniqueName = EnsureUniqueName(baseName, _room.Players.Values.Select(p => p.Name));

            var spawn  = Spawns[_room.Players.Count % Spawns.Length];
            var player = new Player
            {
                Id           = Guid.NewGuid().ToString("N")[..8],
                ConnectionId = connectionId,
                Name         = uniqueName,
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
    /// Returns the leaderboard if a tag ended the round; null otherwise.
    /// </summary>
    public List<PlayerSnapshot>? UpdatePosition(string connectionId, float x, float y, string state, string direction)
    {
        lock (_lock)
        {
            var p = FindByConnId(connectionId);
            if (p is null) return null;

            // Validate against arena walls — if new position collides, keep old position
            var arena = ArenaDefinition.Get(_room.ArenaId);
            if (!arena.CollidesWithWall(x, y, 16f))
            {
                p.X = x;
                p.Y = y;
            }

            p.State     = state;
            p.Direction = direction;

            if (_room.Phase == GamePhase.Playing) return CheckTags(p);
            return null;
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
            _room.TotalRounds  = GameRoom.CalculateRounds(_room.Players.Count);
            _room.CurrentRound = 1;

            foreach (var p in _room.Players.Values)
            {
                p.ItDuration  = 0;
                p.IsIt        = false;
                p.ImmuneUntil = 0;
            }

            var arena   = ArenaDefinition.Get(_room.ArenaId);
            var players = _room.Players.Values.ToArray();
            for (int i = 0; i < players.Length; i++)
            {
                var sp = Spawns[i % Spawns.Length];
                var safe = FindSafeSpawn(sp.X, sp.Y, arena);
                players[i].X = safe.X;
                players[i].Y = safe.Y;
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
    /// <returns>The leaderboard, or null if the game was already ended.</returns>
    public List<PlayerSnapshot>? EndGame()
    {
        lock (_lock) { return EndGameLocked(); }
    }

    /// <inheritdoc />
    public bool ConsumePendingRestart()
    {
        lock (_lock)
        {
            if (!_pendingRestart) return false;
            _pendingRestart = false;
            return true;
        }
    }

    /// <summary>Resets the room back to Lobby so players can play again.</summary>
    public void ResetToLobby()
    {
        lock (_lock)
        {
            _room.Phase        = GamePhase.Lobby;
            _room.RoundStartMs = 0;
            _room.CurrentRound = 0;
            _room.TotalRounds  = 3;
            _room.Players.Clear();
            _logger.LogInformation("Room reset to Lobby (all players cleared)");
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────

    private List<PlayerSnapshot>? EndGameLocked()
    {
        // Idempotent guard: if already ended (e.g. timer and tag race), return null
        // so the caller knows it was a no-op and skips duplicate broadcasts.
        if (_room.Phase == GamePhase.Ended) return null;

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
    /// Returns the leaderboard if a tag ended the round; null otherwise.
    /// </summary>
    private List<PlayerSnapshot>? CheckTags(Player mover)
    {
        var taggedId = TagChecker.FindTaggedPlayer(mover, _room.Players.Values, GameRoom.TagRadius);
        if (taggedId is null) return null;

        var target = _room.Players[taggedId];
        _logger.LogInformation("Tag: {OldIt} touched {Target} — ending round",
            mover.Name, target.Name);

        _pendingItId = taggedId;

        var leaderboard = EndGameLocked();
        if (leaderboard is not null) _pendingRestart = true;
        return leaderboard;
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

            // Reset round state but preserve accumulated ItDuration across rounds
            foreach (var p in players)
            {
                p.IsIt        = false;
                p.ImmuneUntil = 0;
                p.ItSince     = 0;
            }

            // IT spawns right-center; non-IT players spread on left side
            var arena = ArenaDefinition.Get(_room.ArenaId);
            var itSpawn = FindSafeSpawn(1080f, 360f, arena);
            newIt.X = itSpawn.X;
            newIt.Y = itSpawn.Y;

            var nonIt = players.Where(p => p.Id != newIt.Id).ToArray();
            float[] ys = [180f, 300f, 420f, 540f];
            for (int i = 0; i < nonIt.Length; i++)
            {
                var rawY = nonIt.Length == 1 ? 360f : ys[i % ys.Length];
                var safe = FindSafeSpawn(200f, rawY, arena);
                nonIt[i].X = safe.X;
                nonIt[i].Y = safe.Y;
            }

            BecomeIt(newIt);

            _room.Phase        = GamePhase.Playing;
            _room.RoundStartMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            _room.CurrentRound++;

            _logger.LogInformation("Round {Round}/{Total} started; IT={Name}; players={Count}",
                _room.CurrentRound, _room.TotalRounds, newIt.Name, players.Length);

            var snapshot = _room.Players.Values.Select(PlayerSnapshot.From).ToList();
            return (newIt.Id, snapshot, _room.RemainingSeconds());
        }
    }

    private static void BecomeIt(Player player) => TagChecker.BecomeIt(player);

    private Player? FindByConnId(string connId) =>
        _room.Players.Values.FirstOrDefault(p => p.ConnectionId == connId);

    /// <summary>Trims, truncates, and strips HTML-sensitive characters from player names.</summary>
    private static string SanitiseName(string raw)
    {
        // Strip < and > to prevent any downstream XSS if names are rendered in raw HTML.
        var cleaned = raw.Replace("<", "").Replace(">", "").Trim();
        return cleaned.Length > 20 ? cleaned[..20] : cleaned.Length == 0 ? "Player" : cleaned;
    }

    /// <summary>
    /// Ensures each lobby display name is unique (case-insensitive) by appending
    /// a numeric suffix such as " (2)" when needed.
    /// </summary>
    private static string EnsureUniqueName(string baseName, IEnumerable<string> existingNames)
    {
        var existing = existingNames.ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!existing.Contains(baseName)) return baseName;

        for (var i = 2; i <= 99; i++)
        {
            var suffix = $" ({i})";
            var maxBaseLength = Math.Max(1, 20 - suffix.Length);
            var trimmedBase = baseName.Length > maxBaseLength
                ? baseName[..maxBaseLength]
                : baseName;
            var candidate = trimmedBase + suffix;
            if (!existing.Contains(candidate)) return candidate;
        }

        return baseName[..Math.Min(baseName.Length, 15)] + "-" + Guid.NewGuid().ToString("N")[..4];
    }

    /// <summary>Returns the requested position if it doesn't collide with walls, or a nearby safe position.</summary>
    private static (float X, float Y) FindSafeSpawn(float x, float y, ArenaDefinition arena)
    {
        if (!arena.CollidesWithWall(x, y, 16f)) return (x, y);

        // Spiral outward searching for a non-colliding position
        for (float offset = 48f; offset <= 200f; offset += 32f)
        {
            float[] deltas = [-offset, 0f, offset];
            foreach (var dx in deltas)
            foreach (var dy in deltas)
            {
                if (dx == 0f && dy == 0f) continue;
                var nx = Math.Clamp(x + dx, 32f, 1248f);
                var ny = Math.Clamp(y + dy, 32f, 688f);
                if (!arena.CollidesWithWall(nx, ny, 16f))
                    return (nx, ny);
            }
        }
        return (640f, 360f); // center fallback
    }
}
