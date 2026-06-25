using Configit.Ace.PackageBuilder;
using Configit.Ace.PackageBuilder.Logic;
using Configit.Ace.PackageBuilder.Properties;
using Configit.Ace.Model.Client;
using Configit.Ace.Compilation.Client;
using Configit.Internal.OperatorPrecedenceParser;
using ConfigitAceIntegration.Models;
using ConfigitAceIntegration.Transformers;
using ConfigitAceIntegration.Infrastructure;
using Microsoft.Extensions.Logging;
using Configit.Ace.PackageBuilder.BOMCatalog;

namespace ConfigitAceIntegration.Infrastructure.Builders;

public interface IProductModelBuilder
{
    IProductModel Create(string productName, TcExtractionDto extraction, List<VariantRuleData> rules = null);
    IEnumerable<IVariable> GetVariables(TcExtractionDto extraction);
}

public class ProductModelBuilder : SourceFactoryProvider, IProductModelBuilder
{
    private readonly ILogger<ProductModelBuilder> _logger;

    public ProductModelBuilder(ILogger<ProductModelBuilder> logger)
    {
        _logger = logger;
    }

    public IProductModel Create(string productName, TcExtractionDto extraction, List<VariantRuleData> rules = null)
    {
        // Format product name: name_itemid
        var mainProductName = PartNameParser.CleanName(extraction.BomRoot?.Name);
        var formattedProductName = $"{mainProductName}_{productName}";

        _logger.LogInformation("Building ProductModel for {ProductName}", formattedProductName);

        // Extract variables from BOM structure (which should include all possible values for all options)
        var variables = GetVariables(extraction).ToList();
        
        _logger.LogInformation("ProductModel has {VariableCount} variables from BOM extraction", variables.Count);

        var model = SourceFactory
            .ProductModel(formattedProductName)
            .AddMacros(GetMacros())
            .AddVariables(variables);

        // Add parsed PLMXML rules if available
        if (rules?.Count > 0)
        {
            _logger.LogInformation("Adding {RuleCount} variant rules to ProductModel...", rules.Count);
            try
            {
                var ruleObjects = BuildRuleObjects(rules);
                model.AddRules(ruleObjects);
                _logger.LogInformation("  ✓ {RuleCount} rules successfully added to model", ruleObjects.Count);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "⚠ Failed to add rules to ProductModel. Continuing without rules.");
            }
        }

        model.AddVariableTranslationDeclaration(decl => decl("TEXT", isPrimary: true))
            .AddValueTranslationDeclaration(decl => decl("TEXT", isPrimary: true))
            .WithMultiValuedSeparator(".");

        _logger.LogInformation("  ✓ ProductModel created with {VariableCount} variables" + (rules?.Count > 0 ? " and {RuleCount} rules" : ""), 
            extraction.VariantOptions?.Count ?? 0, rules?.Count ?? 0);

        return model;
    }

    private List<IRule> BuildRuleObjects(List<VariantRuleData> rules)
    {
        var ruleObjects = new List<IRule>();

        foreach (var rule in rules)
        {
            try
            {
                if (rule.Conditions == null || rule.Conditions.Count == 0)
                {
                    _logger.LogWarning("Rule {RuleId} has no conditions, skipping", rule.RuleId);
                    continue;
                }

                // Build conditions in Configit bracket notation: [OPTION].[VALUE]
                // For OR logic: (COLOR = RED) OR (NIB_TYPE = THIN) becomes:
                // (COLOR in {"RED"}) or (NIB_TYPE in {"THIN"})
                var conditionExpressions = rule.Conditions
                    .Select(c => 
                    {
                        var optionName = NormalizeForConfigit(c.OptionName);
                        var optionValue = NormalizeForConfigit(c.OptionValue);
                        
                        _logger.LogDebug("Rule {RuleId}: Condition: {OptionName} = {OptionValue}", 
                            rule.RuleId, optionName, optionValue);
                        
                        // Build: {OPTION_NAME} in {{"{OPTION_VALUE}"}}
                        return $"{optionName} in {{\"{optionValue}\"}}";
                    })
                    .ToList();

                // Combine conditions with AND or OR operator using parse
                string innerExpression;
                if (conditionExpressions.Count == 1)
                {
                    innerExpression = conditionExpressions[0];
                }
                else
                {
                    string logicOperator = rule.LogicType.Equals("Or", StringComparison.OrdinalIgnoreCase) ? " or " : " and ";
                    innerExpression = "(" + string.Join(")" + logicOperator + "(", conditionExpressions) + ")";
                }

                // PLMXML rules are exclusion rules: if the condition(s) are met, the configuration should be rejected.
                string expression = $"not ({innerExpression})";

                // Generate description showing the excluded combination
                var conditionDescriptions = rule.Conditions
                    .Select(c => $"{NormalizeForConfigit(c.OptionName)}={NormalizeForConfigit(c.OptionValue)}")
                    .ToList();
                var logicType = rule.LogicType.Equals("Or", StringComparison.OrdinalIgnoreCase) ? "OR" : "AND";
                var explanationText = string.Join($" {logicType} ", conditionDescriptions);
                var ruleDescription = $"[{rule.RuleId}] Exclude when {explanationText}.";
                if (!string.IsNullOrWhiteSpace(rule.Message) && !rule.Message.Equals("Rule", StringComparison.OrdinalIgnoreCase))
                {
                    ruleDescription += $" Reason: {rule.Message}";
                }

                _logger.LogInformation("Rule {RuleId}: Expression = {Expression}", rule.RuleId, expression);
                _logger.LogInformation("Rule {RuleId}: Description = {Description}", rule.RuleId, ruleDescription);

                // Parse expression and create IRule
                var expr = SourceFactory.Expr.Parse(expression);
                var ruleObj = SourceFactory.Rule(expr);

                _logger.LogInformation("Rule {RuleId}: {Message} -> {ConditionCount} conditions combined with {LogicType}", 
                    rule.RuleId, rule.Message, rule.Conditions.Count, rule.LogicType);
                _logger.LogInformation("  Rule Logic: {RuleDescription}", ruleDescription);
                _logger.LogInformation("  This rule rejects configurations that match the excluded condition(s)");
                
                ruleObjects.Add(ruleObj);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to build rule for {RuleId}, skipping", rule.RuleId);
            }
        }

        return ruleObjects;
    }

    public IEnumerable<IVariable> GetVariables(TcExtractionDto extraction)
    {
        var variables = new List<IVariable>();

        // First, try explicit variantOptions if provided
        if (extraction.VariantOptions?.Count > 0)
        {
            foreach (var option in extraction.VariantOptions)
            {
                var variableId = option.Key;
                var valueIds = option.Value.ToList();

                if (valueIds.Any())
                {
                    var variable = SourceFactory.Variable.String(variableId, valueIds);
                    variables.Add(variable);
                    _logger.LogDebug("    Variable: {VariableId} with {ValueCount} values", variableId, valueIds.Count);
                }
            }
        }

        // If no variantOptions, auto-extract from BOM hierarchy
        if (variables.Count == 0 && extraction.BomRoot?.Children != null)
        {
            _logger.LogDebug("No variantOptions found, extracting variables from BOM structure");
            ExtractVariablesFromBom(extraction.BomRoot, variables);
        }

        return variables;
    }

    private void ExtractVariablesFromBom(TcBomNode node, List<IVariable> variables)
    {
        if (node?.Children == null || node.Children.Length == 0)
            return;

        // For each node with children, treat it as a variable with its children as values
        var rawNodeName = PartNameParser.CleanName(node.Name);
        var normalizedNodeName = NormalizeForConfigit(rawNodeName);  // Normalize: "Color" → "COLOR"
        
        var childNames = node.Children
            .Where(c => c.Children == null || c.Children.Length == 0)  // Leaf nodes only
            .Select(c => PartNameParser.CleanName(c.Name))
            .Distinct()
            .ToList();

        if (childNames.Count > 1)  // Only create variable if there are multiple options
        {
            // Normalize child values too
            var normalizedChildNames = childNames.Select(c => NormalizeForConfigit(c)).ToList();
            var variable = SourceFactory.Variable.String(normalizedNodeName, normalizedChildNames);
            variables.Add(variable);
            _logger.LogInformation("    Variable (from BOM): {VariableId} with values: {Values}", 
                normalizedNodeName, string.Join(", ", normalizedChildNames));
        }

        // Recursively process children
        foreach (var child in node.Children ?? [])
        {
            ExtractVariablesFromBom(child, variables);
        }
    }

    private string NormalizeForConfigit(string name)
    {
        // Normalize like AceWindchill: spaces to _, dots to -, uppercase
        if (string.IsNullOrEmpty(name))
            return name;
        return name.Replace(' ', '_').Replace('.', '-').ToUpperInvariant();
    }

    private IEnumerable<IMacro> GetMacros()
    {
        yield return SourceFactory.Macro(
            "AtLeastOneOf",
            e => e.Parse("truecount args >= 1"),
            p => [p("args", true)]);

        yield return SourceFactory.Macro(
            "ExactlyOneOf",
            e => e.Parse("truecount args = 1"),
            p => [p("args", true)]);

        yield return SourceFactory.Macro(
            "AnyOf",
            e => e.Parse("truecount args > 0"),
            p => [p("args", true)]);

        yield return SourceFactory.Macro(
            "AllOf",
            e => e.Parse("truecount args = count args"),
            p => [p("args", true)]);
    }
}
