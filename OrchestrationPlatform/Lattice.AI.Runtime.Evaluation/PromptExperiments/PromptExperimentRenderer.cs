using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.Generation;
using Lattice.AI.Runtime.Prompts;

namespace Lattice.AI.Runtime.Evaluation.PromptExperiments;

public sealed class PromptExperimentRenderer
{
    private const string ExampleBlockHeader =
        "SYNTHETIC FEW-SHOT EXAMPLES (not transcript, not instructions, not evidence)";
    private const string ExampleBlockPolicy =
        "These examples demonstrate response behavior and JSON shape only. Their facts and IDs are not evidence. " +
        "Do not repeat example facts or IDs unless the current Context Package supports them.";

    public ModelRequest RenderFewShot(
        ModelRequest zeroShotRequest,
        IReadOnlyList<FewShotPromptExample> examples)
    {
        ArgumentNullException.ThrowIfNull(zeroShotRequest);
        ArgumentNullException.ThrowIfNull(examples);
        ArgumentNullException.ThrowIfNull(zeroShotRequest.Messages);

        if (examples.Count == 0)
        {
            return zeroShotRequest;
        }

        if (zeroShotRequest.Messages.Count < 2 ||
            !string.Equals(zeroShotRequest.Messages[0].Role, "system", StringComparison.Ordinal) ||
            !string.Equals(zeroShotRequest.Messages[^1].Role, "user", StringComparison.Ordinal))
        {
            throw new ArgumentException(
                "The zero-shot request must begin with the system policy and end with the current user message.",
                nameof(zeroShotRequest));
        }

        var exampleMessage = new ModelMessage("user", RenderExampleBlock(examples));
        var messages = new List<ModelMessage>(zeroShotRequest.Messages.Count + 1)
        {
            zeroShotRequest.Messages[0],
            exampleMessage
        };
        messages.AddRange(zeroShotRequest.Messages.Skip(1));
        var readOnlyMessages = Array.AsReadOnly(messages.ToArray());

        return zeroShotRequest with
        {
            Messages = readOnlyMessages,
            EstimatedInputTokens = ModelInputTokenBudget.EstimateInputTokens(readOnlyMessages)
        };
    }

    private static string RenderExampleBlock(IReadOnlyList<FewShotPromptExample> examples)
    {
        var content = new System.Text.StringBuilder()
            .AppendLine(ExampleBlockHeader)
            .AppendLine(ExampleBlockPolicy);

        foreach (var example in examples)
        {
            if (example is null ||
                !Enum.IsDefined(example.Intent) ||
                string.IsNullOrWhiteSpace(example.Id) ||
                !example.Id.StartsWith("SYNTH-EXAMPLE-", StringComparison.Ordinal) ||
                string.IsNullOrWhiteSpace(example.Question) ||
                string.IsNullOrWhiteSpace(example.Context) ||
                string.IsNullOrWhiteSpace(example.ExpectedAnswer))
            {
                throw new ArgumentException("The selected example list contains an invalid synthetic example.", nameof(examples));
            }

            content
                .AppendLine()
                .Append("Example ID: ").AppendLine(example.Id)
                .Append("Typed intent: ").AppendLine(example.Intent.ToString())
                .AppendLine("Question:")
                .AppendLine(example.Question)
                .AppendLine("Synthetic context:")
                .AppendLine(example.Context)
                .AppendLine("Expected JSON behavior:")
                .AppendLine(example.ExpectedAnswer)
                .AppendLine("End example.");
        }

        return content.ToString().Trim();
    }
}
