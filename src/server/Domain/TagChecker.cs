namespace PoTagGame.Domain;

/// <summary>
/// Pure domain helper: proximity-based tag detection and IT assignment.
/// Separated from GameService to keep tag-rule logic independently testable.
/// </summary>
public static class TagChecker
{
    /// <summary>
    /// Checks whether <paramref name="mover"/> (the current IT player) is close
    /// enough to tag any other player. Returns the tagged player's Id, or null.
    /// </summary>
    public static string? FindTaggedPlayer(
        Player mover,
        IEnumerable<Player> allPlayers,
        float tagRadius)
    {
        if (!mover.IsIt) return null;

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (nowMs < mover.ImmuneUntil) return null;

        foreach (var target in allPlayers)
        {
            if (target.Id == mover.Id) continue;
            if (nowMs < target.ImmuneUntil) continue;

            var dx   = mover.X - target.X;
            var dy   = mover.Y - target.Y;
            var dist = MathF.Sqrt(dx * dx + dy * dy);

            if (dist <= tagRadius)
                return target.Id;
        }

        return null;
    }

    /// <summary>Assigns IT status to <paramref name="player"/>, recording the start time and granting immunity.</summary>
    public static void BecomeIt(Player player)
    {
        player.IsIt        = true;
        player.ItSince     = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        player.ImmuneUntil = player.ItSince + GameRoom.ImmunityMs;
    }
}
