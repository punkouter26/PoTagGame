namespace TagGame.Features.Tag;

// ── DTOs ─────────────────────────────────────────────────────────────────────

/// <summary>Server → All: emitted when IT transfers from one player to another.</summary>
public sealed record TaggedResponse(string NewItId, string OldItId);
