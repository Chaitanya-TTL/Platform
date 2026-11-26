using System.Text.Json;
using System.Text.Json.Serialization;
using Lattice.AI.Runtime.Contracts.Evidence;

namespace Lattice.AI.Runtime.Tests.SourceEvidence;

public sealed class SourceEvidenceContractTests
{
    [Fact]
    public void ProjectionBatch_DeserializesWebJsonAndPreservesSnapshotAndSourceStatus()
    {
        const string json = """
            {
              "schemaVersion": "1.0",
              "investigationId": "synthetic-investigation",
              "snapshotRevision": 3,
              "snapshotLifecycle": "partial",
              "snapshotCompleteness": "partial",
              "records": [
                {
                  "schemaVersion": "1.0",
                  "recordId": "source-evidence:sha256:record",
                  "tenantId": null,
                  "investigationId": "synthetic-investigation",
                  "snapshotRevision": 3,
                  "sourceApplication": "codebeamer",
                  "sourceRecordId": "SYNTH-REQ-1",
                  "canonicalEntityIds": ["synthetic-requirement"],
                  "recordType": "requirement",
                  "title": "Synthetic requirement",
                  "searchableText": "Synthetic description with 12 mm clearance.",
                  "location": "entities/synthetic-requirement/properties/description",
                  "sourceRevision": "R7",
                  "sourceTimestamp": "2026-11-18T10:00:00Z",
                  "capturedAt": "2026-11-18T10:00:00Z",
                  "freshness": "current",
                  "snapshotLifecycle": "partial",
                  "snapshotCompleteness": "partial",
                  "sourceExtractionStatuses": ["partial"],
                  "sourceOperations": [
                    {
                      "operation": "gather-intelligence",
                      "status": "partial",
                      "freshness": "current",
                      "capturedAt": "2026-11-18T10:00:00Z"
                    }
                  ],
                  "contentHash": "sha256:content",
                  "evidenceIds": [],
                  "provenanceId": "sha256:provenance",
                  "authority": "source-authoritative",
                  "deepLink": null
                }
              ],
              "diagnostics": {
                "canonicalEntityCount": 1,
                "projectedRecordCount": 1,
                "projectedRecordsBySource": { "codebeamer": 1 },
                "excludedByReason": {},
                "sourceOperationStatusCounts": {
                  "codebeamer:gather-intelligence:partial": 1
                }
              }
            }
            """;

        var batch = JsonSerializer.Deserialize<SourceEvidenceProjectionBatch>(
            json,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.NotNull(batch);
        Assert.Equal("1.0", batch.SchemaVersion);
        Assert.Equal("partial", batch.SnapshotLifecycle);
        Assert.Equal(3, batch.SnapshotRevision);
        var record = Assert.Single(batch.Records);
        Assert.Equal("1.0", record.SchemaVersion);
        Assert.Equal("current", record.Freshness);
        Assert.Equal("partial", Assert.Single(record.SourceExtractionStatuses));
        Assert.Equal("partial", Assert.Single(record.SourceOperations).Status);
        Assert.Equal("Synthetic description with 12 mm clearance.", record.SearchableText);
        Assert.Equal(1, batch.Diagnostics.ProjectedRecordsBySource["codebeamer"]);
    }

    [Fact]
    public void EngineeringFactEvidence_DeserializesWebJsonWithoutLosingExactValueOrSourceScope()
    {
        const string json = """
            {
              "contractVersion": "1.0",
              "factId": "fact-17",
              "investigationId": "synthetic-investigation",
              "snapshotRevision": 3,
              "sourceApplication": "sap",
              "sourceEntityId": "material-42",
              "canonicalEntityKind": "material",
              "fieldId": "stock.quantity",
              "sourceFieldName": "LABST",
              "displayLabel": "Unrestricted stock",
              "factRole": "metric",
              "exactSourceValue": {"amount": 12.50, "currency": "USD"},
              "sourceValueType": "money",
              "valueType": "money",
              "normalizedValue": {"amount": 12.5, "currency": "USD"},
              "normalizedValueType": "money",
              "unit": "USD",
              "currency": "USD",
              "precision": 2,
              "dimensions": [
                {"dimensionId": "plant", "label": "Plant", "exactValue": "plant-7", "valueType": "identifier"}
              ],
              "observedAt": "2026-11-18T10:00:00Z",
              "freshness": "current",
              "completeness": "complete",
              "derivationStatus": "raw",
              "transformationTrace": [],
              "evidenceIds": ["evidence-17"],
              "citationIds": ["citation-17"],
              "citationEligible": true,
              "sourceAuthority": "source-authoritative",
              "provenance": {
                "source": "sap",
                "provider": "sap-synthetic-fixture",
                "nativeId": "MAT-42",
                "nativeRevision": "R3",
                "sourceExecutionId": "execution-8",
                "artifactReference": "material-42",
                "checksum": "sha256:source",
                "observedAt": "2026-11-18T10:00:00Z",
                "authority": "source-authoritative"
              },
              "authorizationDecisionId": "decision-9"
            }
            """;
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.KebabCaseLower));

        var fact = JsonSerializer.Deserialize<EngineeringFactEvidence>(json, options);

        Assert.NotNull(fact);
        Assert.Equal(3, fact.SnapshotRevision);
        Assert.Equal(12.50m, fact.ExactSourceValue.GetProperty("amount").GetDecimal());
        Assert.Equal("LABST", fact.SourceFieldName);
        Assert.Equal("plant-7", Assert.Single(fact.Dimensions).ExactValue.GetString());
        Assert.Equal("decision-9", fact.AuthorizationDecisionId);
        Assert.Equal(EngineeringFactAuthority.SourceAuthoritative, fact.Provenance.Authority);
    }
}
