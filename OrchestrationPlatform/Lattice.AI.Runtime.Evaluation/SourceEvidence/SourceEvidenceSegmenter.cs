using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Lattice.AI.Runtime.Contracts.Evidence;

namespace Lattice.AI.Runtime.Evaluation.SourceEvidence;

public enum SegmentationStrategy
{
    WholeRecord,
    StructuralFieldGroups,
    StructuralSemantic
}

public sealed record SourceEvidenceSegment(
    string SegmentId,
    SourceEvidenceRecord ParentRecord,
    string Text,
    int StartOffset,
    int EndOffset,
    string? Location,
    string ContentHash,
    string SegmentationVersion)
{
    public string RecordId => ParentRecord.RecordId;
    public string SchemaVersion => ParentRecord.SchemaVersion;
    public string? SourceRevision => ParentRecord.SourceRevision;
    public string? ProvenanceId => ParentRecord.ProvenanceId;
}

public sealed class SourceEvidenceSegmenter
{
    private const string SegmentationVersion = "1.0";
    private static readonly Regex ParagraphPattern = new(
        @"\S(?:[\s\S]*?\S)?(?=(?:\r?\n[ \t]*\r?\n)|[ \t\r\n]*$)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public IReadOnlyList<SourceEvidenceSegment> Segment(
        SourceEvidenceRecord record,
        SegmentationStrategy strategy)
    {
        ArgumentNullException.ThrowIfNull(record);
        if (!Enum.IsDefined(strategy))
        {
            throw new ArgumentOutOfRangeException(nameof(strategy), strategy, "Unsupported segmentation strategy.");
        }

        var text = record.SearchableText;
        if (string.IsNullOrWhiteSpace(text))
        {
            return [];
        }

        var spans = strategy switch
        {
            SegmentationStrategy.WholeRecord => [new TextSpan(0, text.Length)],
            SegmentationStrategy.StructuralFieldGroups => ParagraphSpans(text),
            SegmentationStrategy.StructuralSemantic => SentenceSpans(text),
            _ => throw new ArgumentOutOfRangeException(nameof(strategy), strategy, "Unsupported segmentation strategy.")
        };

        return spans
            .Select(span => CreateSegment(record, strategy, span))
            .ToArray();
    }

    private static IReadOnlyList<TextSpan> ParagraphSpans(string text) =>
        ParagraphPattern.Matches(text)
            .Select(match => new TextSpan(match.Index, match.Length))
            .ToArray();

    private static IReadOnlyList<TextSpan> SentenceSpans(string text)
    {
        // This is a sentence-boundary baseline, not a model-based topic-shift detector.
        var spans = new List<TextSpan>();
        var start = 0;
        for (var index = 0; index < text.Length; index++)
        {
            if (!IsSentenceTerminator(text, index))
            {
                continue;
            }

            var end = index + 1;
            AddTrimmedSpan(text, start, end, spans);
            start = end;
        }

        AddTrimmedSpan(text, start, text.Length, spans);
        return spans;
    }

    private static bool IsSentenceTerminator(string text, int index)
    {
        var character = text[index];
        if (character is not '.' and not '!' and not '?')
        {
            return false;
        }

        if (character == '.'
            && index > 0
            && index + 1 < text.Length
            && char.IsDigit(text[index - 1])
            && char.IsDigit(text[index + 1]))
        {
            return false;
        }

        return index + 1 == text.Length || char.IsWhiteSpace(text[index + 1]);
    }

    private static void AddTrimmedSpan(string text, int start, int end, ICollection<TextSpan> spans)
    {
        while (start < end && char.IsWhiteSpace(text[start]))
        {
            start++;
        }
        while (end > start && char.IsWhiteSpace(text[end - 1]))
        {
            end--;
        }

        if (end > start)
        {
            spans.Add(new TextSpan(start, end - start));
        }
    }

    private static SourceEvidenceSegment CreateSegment(
        SourceEvidenceRecord record,
        SegmentationStrategy strategy,
        TextSpan span)
    {
        var text = record.SearchableText.Substring(span.Start, span.Length);
        var contentHash = $"sha256:{Digest(text)}";
        var stableIdentity = string.Join(
            "\n",
            record.RecordId,
            record.SourceRevision ?? "",
            record.Location ?? "",
            strategy,
            SegmentationVersion,
            span.Start,
            span.End,
            contentHash);
        var segmentId = $"source-evidence-segment:{Digest(stableIdentity)}";

        return new SourceEvidenceSegment(
            segmentId,
            record,
            text,
            span.Start,
            span.End,
            record.Location,
            contentHash,
            SegmentationVersion);
    }

    private static string Digest(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    private readonly record struct TextSpan(int Start, int Length)
    {
        public int End => Start + Length;
    }
}
