using TagGame.Domain;

namespace TagGame.Features.Position;

// ── DTOs ─────────────────────────────────────────────────────────────────────

/// <summary>Client → Server: position + animation state at ~20 fps.</summary>
public sealed record UpdatePositionRequest(
    float  X,
    float  Y,
    string State,
    string Direction);

// ── Feature Handler ───────────────────────────────────────────────────────────

/// <summary>
/// Encapsulates the UpdatePosition use-case.
/// Validates input, delegates to GameService, and returns the updated snapshot.
/// Input validation guards (SOLID: SRP — validation lives here, not in the hub).
/// </summary>
public sealed class UpdatePositionHandler(GameService game, ILogger<UpdatePositionHandler> logger)
{
    private static readonly float   CanvasW    = 1280f;
    private static readonly float   CanvasH    = 720f;
    private static readonly HashSet<string> ValidStates     = ["IDLE", "WALK", "JUMP", "PUNCH"];
    private static readonly HashSet<string> ValidDirections = ["north", "south", "east", "west"];

    /// <summary>
    /// Validates and applies the position update.
    /// Returns false if the update was rejected (hub should log but not broadcast).
    /// </summary>
    public bool Handle(string connectionId, UpdatePositionRequest req)
    {
        // Guard: clamp coordinates to canvas bounds
        if (req.X is < 0 or > 1280 || req.Y is < 0 or > 720)
        {
            logger.LogDebug(
                "UpdatePosition clamped for connId={ConnId}: x={X} y={Y}",
                connectionId, req.X, req.Y);
        }

        if (!ValidStates.Contains(req.State))
        {
            logger.LogWarning(
                "UpdatePosition rejected for connId={ConnId}: invalid state '{State}'",
                connectionId, req.State);
            return false;
        }

        if (!ValidDirections.Contains(req.Direction))
        {
            logger.LogWarning(
                "UpdatePosition rejected for connId={ConnId}: invalid direction '{Dir}'",
                connectionId, req.Direction);
            return false;
        }

        var x = Math.Clamp(req.X, 0f, CanvasW);
        var y = Math.Clamp(req.Y, 0f, CanvasH);

        game.UpdatePosition(connectionId, x, y, req.State, req.Direction);
        return true;
    }
}
