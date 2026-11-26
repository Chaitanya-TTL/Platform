using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Text.Json;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Telemetry;
using Microsoft.Extensions.Options;
using Orchestration.API.AI.Telemetry;

namespace Lattice.AI.Runtime.Tests.Telemetry;

public sealed class AiRuntimeTelemetryPrivacyProcessorTests
{
    [Fact]
    public void SensitiveEvidenceAndAnswerPayloadTagsAreRemovedBeforeSerialization()
    {
        var activity = new Activity("source-evidence-retrieval");
        activity.Start();
        activity.SetTag("source.evidence.text", "SOURCE_TEXT_PRIVATE_SENTINEL");
        activity.SetTag("query.text", "QUERY_TEXT_PRIVATE_SENTINEL");
        activity.SetTag("prompt.content", "PROMPT_PRIVATE_SENTINEL");
        activity.SetTag("answer.text", "ANSWER_PRIVATE_SENTINEL");
        activity.SetTag("embedding.vector", "EMBEDDING_PRIVATE_SENTINEL");
        activity.SetTag("embedding.model_version", "safe-model-version");
        activity.SetTag("source.deep_link", "https://plm.example/PRIVATE_DEEP_LINK");
        activity.SetTag("source.native_id", "NATIVE_ID_PRIVATE_SENTINEL");
        activity.SetTag("source.evidence.passage_count", 3);
        activity.Stop();

        var processor = new AiRuntimeTelemetryPrivacyProcessor(new AiRuntimeTelemetryOptions());
        processor.OnEnd(activity);
        var serialized = JsonSerializer.Serialize(new
        {
            activity.DisplayName,
            tags = activity.TagObjects.Select(tag => new { tag.Key, value = tag.Value?.ToString() })
        });

        Assert.Equal(3, activity.GetTagItem("source.evidence.passage_count"));
        Assert.Equal("safe-model-version", activity.GetTagItem("embedding.model_version"));
        Assert.DoesNotContain("SOURCE_TEXT_PRIVATE_SENTINEL", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("QUERY_TEXT_PRIVATE_SENTINEL", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("PROMPT_PRIVATE_SENTINEL", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("ANSWER_PRIVATE_SENTINEL", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("EMBEDDING_PRIVATE_SENTINEL", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("PRIVATE_DEEP_LINK", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("NATIVE_ID_PRIVATE_SENTINEL", serialized, StringComparison.Ordinal);
    }

    [Fact]
    public void SourceEvidenceStagesAndCountersExposeOnlyBoundedAggregateDimensions()
    {
        using var capture = new TelemetryCapture();
        var telemetry = new AiRuntimeTelemetry();
        var requestContext = new RuntimeRequestContext(
            "request-source-evidence-aggregate",
            new string('a', 32),
            null,
            null);
        var stages = new[]
        {
            "source-evidence-projection",
            "source-evidence-segmentation",
            "source-evidence-embedding",
            "source-evidence-retrieval-exact",
            "source-evidence-retrieval-lexical",
            "source-evidence-retrieval-vector",
            "source-evidence-retrieval-hybrid",
            "context-compilation"
        };

        foreach (var stageName in stages)
        {
            using var stage = telemetry.StartStage(stageName, requestContext);
            stage.SetDisposition("completed");
        }

        telemetry.RecordSourceEvidenceOmissions(2);
        telemetry.RecordSourceEvidenceIndexStatus(SourceEvidenceIndexState.Stale);
        telemetry.RecordSourceEvidenceIndexRevision();

        var durationMeasurements = capture.Measurements
            .Where(measurement => measurement.Name == "lattice.ai.runtime.stage.duration")
            .ToArray();
        Assert.All(stages, stageName =>
            Assert.Contains(durationMeasurements, measurement =>
                measurement.Tags.Any(tag => tag.Key == "stage" && Equals(tag.Value, stageName))));
        Assert.Contains(capture.Measurements, measurement =>
            measurement.Name == "lattice.ai.runtime.source_evidence.omissions" &&
            Equals(measurement.Value, 2L) &&
            measurement.Tags.Length == 0);
        Assert.Contains(capture.Measurements, measurement =>
            measurement.Name == "lattice.ai.runtime.source_evidence.index.statuses" &&
            Equals(measurement.Value, 1L) &&
            measurement.Tags.Any(tag => tag.Key == "status" && Equals(tag.Value, "stale")));
        Assert.Contains(capture.Measurements, measurement =>
            measurement.Name == "lattice.ai.runtime.source_evidence.index.revisions" &&
            Equals(measurement.Value, 1L) &&
            measurement.Tags.Length == 0);

        var serialized = JsonSerializer.Serialize(capture.Measurements.Select(measurement => new
        {
            measurement.Name,
            measurement.Value,
            tags = measurement.Tags.Select(tag => new { tag.Key, value = tag.Value?.ToString() })
        }));
        Assert.DoesNotContain("request-source-evidence-aggregate", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain(requestContext.TraceId, serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("investigation.id", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("tenant.id", serialized, StringComparison.Ordinal);
    }

    private sealed record MeasurementRecord(
        string Name,
        object Value,
        KeyValuePair<string, object?>[] Tags);

    private sealed class TelemetryCapture : IDisposable
    {
        private readonly MeterListener _meterListener;

        public TelemetryCapture()
        {
            _meterListener = new MeterListener
            {
                InstrumentPublished = (instrument, listener) =>
                {
                    if (instrument.Meter.Name == AiRuntimeTelemetry.MeterName)
                    {
                        listener.EnableMeasurementEvents(instrument);
                    }
                }
            };
            _meterListener.SetMeasurementEventCallback<long>((instrument, value, tags, _) =>
                Measurements.Add(new MeasurementRecord(instrument.Name, value, tags.ToArray())));
            _meterListener.SetMeasurementEventCallback<double>((instrument, value, tags, _) =>
                Measurements.Add(new MeasurementRecord(instrument.Name, value, tags.ToArray())));
            _meterListener.Start();
        }

        public ConcurrentBag<MeasurementRecord> Measurements { get; } = [];

        public void Dispose() => _meterListener.Dispose();
    }
}
