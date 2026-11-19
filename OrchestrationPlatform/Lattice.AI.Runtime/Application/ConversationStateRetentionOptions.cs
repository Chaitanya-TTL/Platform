namespace Lattice.AI.Runtime.Application;

public sealed class ConversationStateRetentionOptions
{
    public int? LifetimeSeconds { get; set; }

    public TimeSpan? GetLifetime()
    {
        var lifetimeSeconds = LifetimeSeconds;
        if (lifetimeSeconds is null) return null;
        if (lifetimeSeconds <= 0)
        {
            throw new InvalidOperationException(
                "AiRuntime:ConversationState:LifetimeSeconds must be positive when configured.");
        }

        return TimeSpan.FromSeconds(lifetimeSeconds.Value);
    }
}
