using System.Text.Json;
using System.Text.Json.Serialization;

namespace Lattice.AI.Runtime.Evaluation;

internal static class Program
{
    private static readonly JsonSerializerOptions ReportJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never
    };

    public static async Task<int> Main(string[] args)
    {
        if (args is ["--help"] or ["-h"])
        {
            Console.Out.WriteLine(
                "Usage: dotnet run --project Lattice.AI.Runtime.Evaluation.csproj -- [--dataset <directory>] [--report <path>]");
            return 0;
        }

        try
        {
            var options = ParseArguments(args);
            var runner = new EngineeringImpactEvaluationRunner();
            var report = await runner.RunAsync(options.DatasetPath, CancellationToken.None).ConfigureAwait(false);
            var json = JsonSerializer.Serialize(report, ReportJsonOptions);
            Console.Out.WriteLine(json);

            if (options.ReportPath is not null)
            {
                var reportPath = Path.GetFullPath(options.ReportPath);
                var reportDirectory = Path.GetDirectoryName(reportPath);
                if (!string.IsNullOrEmpty(reportDirectory))
                {
                    Directory.CreateDirectory(reportDirectory);
                }
                await File.WriteAllTextAsync(reportPath, json + Environment.NewLine).ConfigureAwait(false);
            }

            return report.Passed ? 0 : 1;
        }
        catch (Exception exception) when (
            exception is ArgumentException or IOException or InvalidDataException or UnauthorizedAccessException)
        {
            Console.Error.WriteLine($"Evaluation failed: {exception.Message}");
            return 2;
        }
    }

    private static CommandOptions ParseArguments(IReadOnlyList<string> args)
    {
        var datasetPath = Path.Combine("evals", "engineering-impact", "v1");
        string? reportPath = null;
        for (var index = 0; index < args.Count; index++)
        {
            switch (args[index])
            {
                case "--dataset" when index + 1 < args.Count:
                    datasetPath = args[++index];
                    break;
                case "--report" when index + 1 < args.Count:
                    reportPath = args[++index];
                    break;
                default:
                    throw new ArgumentException($"Unknown or incomplete argument '{args[index]}'.");
            }
        }

        return new CommandOptions(datasetPath, reportPath);
    }

    private sealed record CommandOptions(string DatasetPath, string? ReportPath);
}
