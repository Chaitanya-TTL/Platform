using System;
using System.Collections.Generic;
using System.Linq;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;

namespace ConfigitAceIntegration.Infrastructure;

/// <summary>
/// Data contract for parsed VariantRuleCheck from PLMXML
/// </summary>
public record VariantRuleData(
    string RuleId,
    string LogicType,  // "And" or "Or"
    List<OptionCondition> Conditions,
    string Message);

/// <summary>
/// Single option condition in a rule
/// </summary>
public record OptionCondition(
    string OptionName,      // e.g., "COLOR"
    string OptionValue);    // e.g., "RED"

/// <summary>
/// Parses PLMXML files and extracts variant rules with AND/OR logic
/// </summary>
public interface IPlmxmlRuleParser
{
    List<VariantRuleData> ParseRules(string plmxmlContent);
}

public class PlmxmlRuleParser : IPlmxmlRuleParser
{
    private readonly ILogger _logger;

    public PlmxmlRuleParser(ILogger logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Parses PLMXML content and extracts all VariantRuleCheck elements with AND/OR logic
    /// </summary>
    public List<VariantRuleData> ParseRules(string plmxmlContent)
    {
        var rules = new List<VariantRuleData>();

        try
        {
            if (string.IsNullOrEmpty(plmxmlContent))
            {
                _logger.LogWarning("PLMXML content is empty");
                return rules;
            }

            var doc = XDocument.Parse(plmxmlContent);
            var ns = XNamespace.Get("http://www.plmxml.org/Schemas/PLMXMLSchema");

            // Build option ID → name mapping from <Option> elements
            var optionMap = BuildOptionMap(doc, ns);
            _logger.LogInformation("Found {OptionCount} options in PLMXML", optionMap.Count);

            // Extract all VariantRuleCheck elements
            var ruleElements = doc.Descendants(ns + "VariantRuleCheck").ToList();
            _logger.LogInformation("Found {RuleCount} VariantRuleCheck elements", ruleElements.Count);

            foreach (var ruleElement in ruleElements)
            {
                try
                {
                    var rule = ParseVariantRuleCheck(ruleElement, ns, optionMap);
                    if (rule != null)
                    {
                        rules.Add(rule);
                        _logger.LogDebug("Parsed rule: {RuleId} ({LogicType})", rule.RuleId, rule.LogicType);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to parse VariantRuleCheck element");
                }
            }

            _logger.LogInformation("✓ Extracted {ParsedRuleCount} variant rules from PLMXML", rules.Count);
            return rules;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to parse PLMXML content");
            return rules;
        }
    }

    private Dictionary<string, string> BuildOptionMap(XDocument doc, XNamespace ns)
    {
        var optionMap = new Dictionary<string, string>();

        foreach (var optionElement in doc.Descendants(ns + "Option"))
        {
            var id = optionElement.Attribute("id")?.Value;
            var name = optionElement.Attribute("name")?.Value;

            if (!string.IsNullOrEmpty(id) && !string.IsNullOrEmpty(name))
            {
                optionMap[id] = name;
                _logger.LogDebug("Mapped option {OptionId} → {OptionName}", id, name);
            }
        }

        return optionMap;
    }

    private VariantRuleData? ParseVariantRuleCheck(XElement ruleElement, XNamespace ns, Dictionary<string, string> optionMap)
    {
        var ruleId = ruleElement.Attribute("id")?.Value ?? "unknown";
        var conditions = new List<OptionCondition>();
        string? logicType = null;

        // Check for <And> block
        var andElement = ruleElement.Element(ns + "And");
        if (andElement != null)
        {
            logicType = "And";
            conditions.AddRange(ParseConditions(andElement, ns, optionMap));
        }

        // Check for <Or> block
        var orElement = ruleElement.Element(ns + "Or");
        if (orElement != null)
        {
            logicType = "Or";
            conditions.AddRange(ParseConditions(orElement, ns, optionMap));
        }

        // Get the message
        var messageElement = ruleElement.Element(ns + "CheckMessage");
        var message = messageElement?.Attribute("message")?.Value ?? "Rule";

        if (logicType == null || conditions.Count == 0)
        {
            _logger.LogWarning("VariantRuleCheck {RuleId} has no And/Or conditions", ruleId);
            return null;
        }

        return new VariantRuleData(ruleId, logicType, conditions, message);
    }

    private List<OptionCondition> ParseConditions(XElement logicElement, XNamespace ns, Dictionary<string, string> optionMap)
    {
        var conditions = new List<OptionCondition>();

        foreach (var optionIs in logicElement.Elements(ns + "OptionIs"))
        {
            var optionRef = optionIs.Attribute("optionRef")?.Value;
            var value = optionIs.Attribute("value")?.Value;

            if (!string.IsNullOrEmpty(optionRef) && !string.IsNullOrEmpty(value))
            {
                // Remove the # prefix from reference
                var refId = optionRef.TrimStart('#');
                var optionName = optionMap.TryGetValue(refId, out var name) ? name : refId;

                conditions.Add(new OptionCondition(optionName, value));
                _logger.LogDebug("  Condition: {OptionName}={OptionValue}", optionName, value);
            }
        }

        return conditions;
    }
}
