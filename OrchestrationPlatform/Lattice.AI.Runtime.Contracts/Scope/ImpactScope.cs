using System.Text.Json;
using System.Text.Json.Serialization;

namespace Lattice.AI.Runtime.Contracts.Scope;

public sealed record ImpactScope(
    [property: JsonConverter(typeof(ReadOnlyStringSetJsonConverter))]
    IReadOnlySet<string> RelationshipTypes,
    int? MaxHops,
    [property: JsonConverter(typeof(ReadOnlyStringSetJsonConverter))]
    IReadOnlySet<string> SourceSystems,
    DateTimeOffset? AsOf);

public sealed class ReadOnlyStringSetJsonConverter : JsonConverter<IReadOnlySet<string>>
{
    public override IReadOnlySet<string> Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options)
    {
        var values = JsonSerializer.Deserialize<string[]>(ref reader, options) ?? Array.Empty<string>();
        return new HashSet<string>(values, StringComparer.Ordinal);
    }

    public override void Write(
        Utf8JsonWriter writer,
        IReadOnlySet<string> value,
        JsonSerializerOptions options)
    {
        writer.WriteStartArray();

        foreach (var item in value.Order(StringComparer.Ordinal))
        {
            JsonSerializer.Serialize(writer, item, options);
        }

        writer.WriteEndArray();
    }
}
