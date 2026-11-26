using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Evaluation.SourceEvidence;

namespace Lattice.AI.Runtime.Tests.SourceEvidence;

public sealed class SourceEvidenceSegmentationTests
{
    [Fact]
    public void Segment_ProducesStableOffsetsForEachCandidateAndPreservesEngineeringSymbols()
    {
        const string text = "Hold 18 bar at 72 °C. Maintain 2.0 mm clearance.\r\n\r\nApply 4.5 kN for 30 seconds.";
        var record = CreateRecord(text);
        var segmenter = new SourceEvidenceSegmenter();

        var wholeRecord = segmenter.Segment(record, SegmentationStrategy.WholeRecord);
        var fieldGroups = segmenter.Segment(record, SegmentationStrategy.StructuralFieldGroups);
        var structuralSemantic = segmenter.Segment(record, SegmentationStrategy.StructuralSemantic);

        Assert.Single(wholeRecord);
        Assert.Equal(2, fieldGroups.Count);
        Assert.Equal(3, structuralSemantic.Count);
        Assert.Contains("72 °C", wholeRecord[0].Text);
        Assert.Contains("2.0 mm", wholeRecord[0].Text);
        Assert.Contains("4.5 kN", wholeRecord[0].Text);

        foreach (var segment in wholeRecord.Concat(fieldGroups).Concat(structuralSemantic))
        {
            Assert.Equal(text.Substring(segment.StartOffset, segment.EndOffset - segment.StartOffset), segment.Text);
            Assert.Equal(record.Location, segment.Location);
            Assert.Equal(record.RecordId, segment.RecordId);
        }

        var repeated = segmenter.Segment(record, SegmentationStrategy.StructuralSemantic);
        Assert.Equal(
            structuralSemantic.Select(segment => segment.SegmentId),
            repeated.Select(segment => segment.SegmentId));

        var changed = segmenter.Segment(
            record with
            {
                SearchableText = text.Replace("18 bar", "19 bar", StringComparison.Ordinal),
                ContentHash = "sha256:changed",
            },
            SegmentationStrategy.StructuralSemantic);
        Assert.NotEqual(structuralSemantic[0].SegmentId, changed[0].SegmentId);
    }

    [Fact]
    public void Segment_ReturnsNoSegmentsForMissingOrWhitespaceText()
    {
        var segmenter = new SourceEvidenceSegmenter();

        Assert.Empty(segmenter.Segment(
            CreateRecord(" \r\n "),
            SegmentationStrategy.WholeRecord));
    }

    private static SourceEvidenceRecord CreateRecord(string text) => new(
        SchemaVersion: "1.0",
        RecordId: "source-evidence:synthetic",
        TenantId: null,
        InvestigationId: "synthetic-investigation",
        SnapshotRevision: 1,
        SourceApplication: "SyntheticPLM",
        SourceRecordId: "SYNTH-REQ-001",
        CanonicalEntityIds: [],
        RecordType: "requirement",
        Title: "Synthetic requirement",
        SearchableText: text,
        Location: "synthetic://requirements/SYNTH-REQ-001/description",
        SourceRevision: "R1",
        SourceTimestamp: null,
        CapturedAt: null,
        Freshness: "current",
        SnapshotLifecycle: "ready",
        SnapshotCompleteness: "complete",
        SourceExtractionStatuses: ["available"],
        SourceOperations: [],
        ContentHash: "sha256:original",
        EvidenceIds: [],
        ProvenanceId: "sha256:provenance",
        Authority: "source-authoritative",
        DeepLink: null);
}
