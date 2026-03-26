namespace TagGame.Domain;

/// <summary>
/// Immutable value-object snapshot of a Player, safe for JSON serialisation.
/// Follows the Memento pattern — the hub and background service only ever
/// broadcast these, never the mutable <see cref="Player"/> entities.
/// </summary>
public sealed record PlayerSnapshot(
    string Id,
    string Name,
    int    ColorIdx,
    float  X,
    float  Y,
    string State,
    string Direction,
    bool   IsIt,
    double ItDuration,
    double ImmuneUntil)
{
    /// <summary>Factory method — creates a snapshot from a live entity.</summary>
    public static PlayerSnapshot From(Player p) => new(
        p.Id, p.Name, p.ColorIdx, p.X, p.Y,
        p.State, p.Direction, p.IsIt, p.ItDuration, p.ImmuneUntil);
}
