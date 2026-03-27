namespace PoTagGame.Domain;

/// <summary>A single frame in the replay buffer — timestamped snapshot of all players.</summary>
public sealed record ReplayFrame(double TimestampMs, List<PlayerSnapshot> Players);

/// <summary>Full replay of a round — metadata + ordered frames.</summary>
public sealed record ReplayData(string ArenaId, string ItId, List<ReplayFrame> Frames);

/// <summary>
/// Singleton service that records position snapshots during gameplay.
/// Captures at a configurable interval (default: every 200 ms = 5 fps).
/// Only stores the most recent round (ring buffer of 1 round).
/// </summary>
public sealed class ReplayRecorder
{
    private readonly Lock _lock = new();
    private readonly List<ReplayFrame> _frames = new(700);
    private string _arenaId = "grassland";
    private string _itId    = "";

    /// <summary>Clears buffer and starts recording a new round.</summary>
    public void StartRound(string arenaId, string itId)
    {
        lock (_lock)
        {
            _frames.Clear();
            _arenaId = arenaId;
            _itId    = itId;
        }
    }

    /// <summary>Records one frame of player positions.</summary>
    public void RecordFrame(List<PlayerSnapshot> players)
    {
        lock (_lock)
        {
            // Cap at ~700 frames (120s at 5fps + margin)
            if (_frames.Count >= 700) return;

            _frames.Add(new ReplayFrame(
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                players));
        }
    }

    /// <summary>Returns the recorded replay data for the most recent round.</summary>
    public ReplayData? GetReplay()
    {
        lock (_lock)
        {
            if (_frames.Count == 0) return null;
            return new ReplayData(_arenaId, _itId, [.. _frames]);
        }
    }
}
