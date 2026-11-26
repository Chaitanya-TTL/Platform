using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Lattice.AI.Runtime.Telemetry;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Orchestration.API.AI.Telemetry;

public sealed class CopilotExecutionTraceLogger : ICopilotExecutionTrace
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> SensitivePropertyNames =
    [
        "authorization",
        "authorizationheader",
        "signedauthorizationdecisiontoken",
        "token",
        "accesstoken",
        "refreshtoken",
        "apikey",
        "secret",
        "cookie",
        "setcookie",
        "credential",
        "credentials"
    ];
    private static readonly Regex BearerCredential = new(
        @"\bBearer\s+[^\s,;""']+",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex CredentialAssignment = new(
        @"(?<name>api[-_ ]?key|access[-_ ]?token|authorization|cookie|secret)\s*[:=]\s*(?:""[^""]*""|'[^']*'|[^\s,;]+)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private readonly ILogger<CopilotExecutionTraceLogger> _logger;
    private readonly CopilotExecutionTraceOptions _options;

    public CopilotExecutionTraceLogger(
        ILogger<CopilotExecutionTraceLogger> logger,
        IOptions<CopilotExecutionTraceOptions> options,
        IHostEnvironment environment)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(environment);
        _options = options.Value;

        if (_options.FullPayloadTraceEnabled && environment.IsProduction())
        {
            throw new InvalidOperationException(
                "Full Copilot payload tracing is not permitted in Production.");
        }
    }

    public void Write(CopilotExecutionTraceEvent traceEvent)
    {
        if (!_options.Enabled)
        {
            return;
        }

        try
        {
            var includeFullPayload = _options.FullPayloadTraceEnabled &&
                string.Equals(traceEvent.PayloadDetail, "full", StringComparison.Ordinal);
            var safeEvent = includeFullPayload
                ? traceEvent
                : traceEvent with { PayloadDetail = "summary", FullPayload = null };
            var eventNode = JsonSerializer.SerializeToNode(safeEvent, JsonOptions);
            Sanitize(eventNode);
            _logger.LogInformation(
                "CopilotExecutionTrace {TraceEventJson}",
                eventNode?.ToJsonString(JsonOptions) ?? "null");
        }
        catch (Exception exception)
        {
            try
            {
                _logger.LogError(
                    "Copilot execution trace write failed ({ExceptionType}).",
                    exception.GetType().Name);
            }
            catch
            {
                // Diagnostic logging must not affect answer execution.
            }
        }
    }

    private static void Sanitize(JsonNode? node)
    {
        if (node is JsonObject jsonObject)
        {
            foreach (var property in jsonObject.ToList())
            {
                if (IsSensitiveProperty(property.Key))
                {
                    jsonObject.Remove(property.Key);
                    continue;
                }

                var sanitizedValue = SanitizeValue(property.Value);
                if (!ReferenceEquals(property.Value, sanitizedValue))
                {
                    jsonObject[property.Key] = sanitizedValue;
                }
            }
        }
        else if (node is JsonArray jsonArray)
        {
            for (var index = 0; index < jsonArray.Count; index++)
            {
                var sanitizedValue = SanitizeValue(jsonArray[index]);
                if (!ReferenceEquals(jsonArray[index], sanitizedValue))
                {
                    jsonArray[index] = sanitizedValue;
                }
            }
        }
    }

    private static JsonNode? SanitizeValue(JsonNode? node)
    {
        if (node is JsonObject or JsonArray)
        {
            Sanitize(node);
            return node;
        }

        if (node is JsonValue jsonValue &&
            jsonValue.TryGetValue<string>(out var text) &&
            text is not null)
        {
            var redacted = CredentialAssignment.Replace(
                BearerCredential.Replace(text, "Bearer [REDACTED]"),
                "${name}=[REDACTED]");
            return string.Equals(text, redacted, StringComparison.Ordinal)
                ? node
                : JsonValue.Create(redacted);
        }

        return node;
    }

    private static bool IsSensitiveProperty(string propertyName)
    {
        var normalized = Regex.Replace(propertyName, "[^a-zA-Z0-9]", string.Empty)
            .ToLowerInvariant();
        return SensitivePropertyNames.Contains(normalized) ||
            normalized.EndsWith("authorizationdecisiontoken", StringComparison.Ordinal);
    }
}
