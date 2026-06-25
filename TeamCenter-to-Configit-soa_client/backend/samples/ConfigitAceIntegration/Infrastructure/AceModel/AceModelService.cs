using ConfigitAceIntegration.Abstractions;
using ConfigitAceIntegration.Models;
using ConfigitAceIntegration.Infrastructure;
using Microsoft.Extensions.Logging;
using System.Text;
using System.Text.Json;

namespace ConfigitAceIntegration.Infrastructure.AceModel;

/// <summary>
/// Creates AceModel work items using direct HTTP REST API calls.
/// Publishes Teamcenter extracted data to Configit's work item management system.
/// Implements complete work item population with features, families, product models, and rules.
/// </summary>
public class AceModelService : IAceModelService
{
    private readonly ILogger<AceModelService> _logger;
    private readonly HttpClient _httpClient;
    private readonly Uri _aceModelUri;
    private readonly string _workItemName;
    private readonly string _workItemDescription;
    private readonly string _brandCode;

    public AceModelService(
        ILogger<AceModelService> logger,
        Uri aceModelUri,
        string apiKey,
        string brandCode,
        string workItemName,
        string workItemDescription,
        string[]? assignedUsers = null)
    {
        _logger = logger;
        _aceModelUri = aceModelUri;
        _workItemName = workItemName;
        _workItemDescription = workItemDescription;
        _brandCode = brandCode;
        
        // Initialize HTTP client with ApiKey authentication
        _httpClient = new HttpClient();
        _httpClient.BaseAddress = aceModelUri;
        _httpClient.DefaultRequestHeaders.Add("Authorization", $"ApiKey {apiKey}");
        _httpClient.DefaultRequestHeaders.Add("Accept", "application/json");
    }

    public async Task BuildAndPublishAsync(
        string productName,
        TcExtractionDto extraction,
        List<VariantRuleData>? variantRules = null,
        CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Building AceModel work item '{WorkItemName}' for product '{ProductName}'", _workItemName, productName);

        try
        {
            // Step 1: Get or create work item
            _logger.LogInformation("  Step 1: Creating/retrieving work item '{WorkItemName}'...", _workItemName);
            var workItemId = await GetOrCreateWorkItemAsync(cancellationToken);
            _logger.LogInformation("  ✓ Work item created/retrieved - ID: {WorkItemId}", workItemId);

            // Step 2: Create library features and families
            _logger.LogInformation("  Step 2: Creating library features and families...");
            var familyCount = await CreateLibraryDataAsync(workItemId, extraction, cancellationToken);
            _logger.LogInformation("  ✓ Created {FamilyCount} families with features", familyCount);

            // Step 3: Create product model and associate features
            _logger.LogInformation("  Step 3: Creating product model and associations...");
            var productCode = NormalizeName(extraction.SourceItemId ?? "Product");
            await CreateProductModelAsync(workItemId, productCode, extraction, cancellationToken);
            _logger.LogInformation("  ✓ Product model created with feature associations");

            // Step 4: Create rules from PLMXML variant rules
            if (variantRules?.Count > 0)
            {
                _logger.LogInformation("  Step 4: Creating rules in work item...");
                await CreateRulesAsync(workItemId, productCode, variantRules, cancellationToken);
                _logger.LogInformation("  ✓ Rules created in work item");
            }

            _logger.LogInformation("✓ AceModel work item successfully populated!");
            _logger.LogInformation("  Work Item ID: {WorkItemId}", workItemId);
            _logger.LogInformation("  Product Code: {ProductCode}", productCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "✗ Failed to build AceModel work item");
            throw;
        }
    }

    private async Task<int> GetOrCreateWorkItemAsync(CancellationToken cancellationToken)
    {
        // Create a fresh work item with unique name
        var uniqueName = $"{_workItemName}_{DateTime.UtcNow:yyyyMMdd_HHmmss}";
        
        _logger.LogInformation("Creating fresh work item: {WorkItemName}", uniqueName);
        
        var payload = new
        {
            name = uniqueName,
            description = _workItemDescription
        };

        var json = JsonSerializer.Serialize(payload);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _httpClient.PostAsync("api/v1/wi", content, cancellationToken);
        
        if (!response.IsSuccessStatusCode)
        {
            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogError("Failed to create work item. Status: {StatusCode}. Response: {Response}", 
                response.StatusCode, responseBody);
            throw new Exception($"Failed to create work item: {response.StatusCode} - {responseBody}");
        }

        var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var result = JsonSerializer.Deserialize<JsonElement>(responseContent, options);
        
        if (result.TryGetProperty("id", out var idElement) && idElement.TryGetInt32(out int workItemId))
        {
            _logger.LogInformation("✓ Created new work item: {WorkItemName} (ID: {WorkItemId})", 
                uniqueName, workItemId);
            return workItemId;
        }

        throw new Exception($"Could not extract work item ID from response: {responseContent}");
    }

    private async Task<int> CreateLibraryDataAsync(
        int workItemId,
        TcExtractionDto extraction,
        CancellationToken cancellationToken)
    {
        // Build families and features dictionary
        var familiesAndFeatures = new Dictionary<string, List<string>>();

        // First, try explicit variantOptions if provided
        if (extraction.VariantOptions?.Count > 0)
        {
            foreach (var option in extraction.VariantOptions)
            {
                familiesAndFeatures[option.Key] = option.Value.ToList();
            }
        }

        // If no variantOptions, auto-extract from BOM hierarchy (parts and choices become families/features)
        if (familiesAndFeatures.Count == 0 && extraction.BomRoot?.Children != null)
        {
            _logger.LogInformation("  No variantOptions found, extracting families/features from BOM structure");
            ExtractFamiliesFromBom(extraction.BomRoot, familiesAndFeatures);
        }

        if (familiesAndFeatures.Count == 0)
        {
            _logger.LogInformation("  (No families/features to create)");
            return 0;
        }

        var familyCount = 0;
        var featureCount = 0;

        foreach (var familyEntry in familiesAndFeatures)
        {
            var familyName = familyEntry.Key;
            var familyCode = NormalizeName(familyName);
            var features = familyEntry.Value;

            try
            {
                // Create family
                _logger.LogDebug("Creating family: {FamilyName} ({FamilyCode})", familyName, familyCode);
                
                // Family payload - matches working Python: familyType, code, description, lifecycle, labels
                var familyPayload = new
                {
                    familyType = "Feature",
                    code = familyCode,
                    description = familyName,
                    lifecycle = "Enabled",
                    labels = new[] { "PLM" }
                };

                var familyJson = JsonSerializer.Serialize(familyPayload);
                _logger.LogInformation("Family payload for {Code}: {Payload}", familyCode, familyJson);
                var familyContent = new StringContent(familyJson, Encoding.UTF8, "application/json");

                var familyResponse = await _httpClient.PostAsync(
                    $"api/v1/wi/{workItemId}/library/families", 
                    familyContent, 
                    cancellationToken);

                if (!familyResponse.IsSuccessStatusCode)
                {
                    var errorBody = await familyResponse.Content.ReadAsStringAsync(cancellationToken);
                    _logger.LogWarning("Failed to create family {FamilyCode}. Status: {StatusCode}. Response: {Response}", 
                        familyCode, familyResponse.StatusCode, errorBody);
                    continue;
                }

                familyCount++;
                _logger.LogDebug("  ✓ Family created: {FamilyName}", familyCode);

                // Create features within family
                foreach (var featureName in features)
                {
                    var featureCode = NormalizeName(featureName);
                    
                    try
                    {
                        _logger.LogDebug("    Creating feature: {FeatureName} ({FeatureCode})", featureName, featureCode);
                        
                        var featurePayload = new
                        {
                            familyType = "Feature",
                            code = featureCode,
                            familyCode = familyCode,
                            description = featureName,
                            lifecycle = "Enabled"
                        };

                        var featureJson = JsonSerializer.Serialize(featurePayload);
                        var featureContent = new StringContent(featureJson, Encoding.UTF8, "application/json");

                        var featureResponse = await _httpClient.PostAsync(
                            $"api/v1/wi/{workItemId}/library/features",
                            featureContent,
                            cancellationToken);

                        if (!featureResponse.IsSuccessStatusCode)
                        {
                            var errorBody = await featureResponse.Content.ReadAsStringAsync(cancellationToken);
                            _logger.LogWarning("Failed to create feature {FeatureCode}. Status: {StatusCode}. Response: {Response}", 
                                featureCode, featureResponse.StatusCode, errorBody);
                            continue;
                        }

                        featureCount++;
                        _logger.LogDebug("      ✓ Feature created: {FeatureName}", featureCode);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "      ✗ Failed to create feature {FeatureName}", featureName);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "  ✗ Failed to create family {FamilyName}", familyName);
            }
        }

        _logger.LogInformation("  Created {FamilyCount} families and {FeatureCount} features", familyCount, featureCount);
        return familyCount;
    }

    private async Task CreateProductModelAsync(
        int workItemId,
        string productCode,
        TcExtractionDto extraction,
        CancellationToken cancellationToken)
    {
        try
        {
            // Create product model
            _logger.LogInformation("  Creating product model: {ProductCode}", productCode);
            
            var productPayload = new
            {
                code = productCode,
                description = extraction.SourceItemId ?? productCode,
                brandCode = string.IsNullOrEmpty(_brandCode) ? productCode : _brandCode,
                featureCode = productCode,
                canBeUsedAsSubmodel = false,
                useArithmeticRules = true,
                useBrochureModels = false,
                useAdvancedEffectivity = false
            };

            var productJson = JsonSerializer.Serialize(productPayload);
            var productContent = new StringContent(productJson, Encoding.UTF8, "application/json");

            var productResponse = await _httpClient.PostAsync(
                $"api/v1/wi/{workItemId}/products/productmodels",
                productContent,
                cancellationToken);

            if (!productResponse.IsSuccessStatusCode)
            {
                var errorBody = await productResponse.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogError("Failed to create product model. Status: {StatusCode}. Response: {Response}", 
                    productResponse.StatusCode, errorBody);
                throw new Exception($"Failed to create product model: {productResponse.StatusCode} - {errorBody}");
            }

            _logger.LogInformation("  ✓ Product model created: {ProductCode}", productCode);

            // Build families dictionary for associations
            var familiesForAssociation = new Dictionary<string, List<string>>();

            // First, try explicit variantOptions if provided
            if (extraction.VariantOptions?.Count > 0)
            {
                foreach (var option in extraction.VariantOptions)
                {
                    familiesForAssociation[option.Key] = option.Value.ToList();
                }
            }

            // If no variantOptions, auto-extract from BOM hierarchy
            if (familiesForAssociation.Count == 0 && extraction.BomRoot?.Children != null)
            {
                ExtractFamiliesFromBom(extraction.BomRoot, familiesForAssociation);
            }

            // Associate families to product model
            _logger.LogInformation("  Associating families to product model...");
            var familyCount = 0;

            if (familiesForAssociation.Count > 0)
            {
                foreach (var familyEntry in familiesForAssociation)
                {
                    var familyName = familyEntry.Key;
                    var familyCode = NormalizeName(familyName);

                    try
                    {
                        _logger.LogDebug("    Associating family: {FamilyCode}", familyCode);
                        
                        // Family association with effectivities - matches working Python
                        var associationPayload = new
                        {
                            familyType = "Feature",
                            code = familyCode,
                            isCalculated = false,
                            isPrivate = false,
                            effectivities = new object[]
                            {
                                new
                                {
                                    startEventCode = $"{productCode}_START",
                                    endEventCode = $"{productCode}_END"
                                }
                            }
                        };

                        var associationJson = JsonSerializer.Serialize(associationPayload);
                        _logger.LogInformation("Association payload for {Code}: {Payload}", familyCode, associationJson);
                        var associationContent = new StringContent(associationJson, Encoding.UTF8, "application/json");

                        var associationResponse = await _httpClient.PostAsync(
                            $"api/v1/wi/{workItemId}/products/productmodels/{productCode}/families",
                            associationContent,
                            cancellationToken);

                        if (!associationResponse.IsSuccessStatusCode)
                        {
                            var errorBody = await associationResponse.Content.ReadAsStringAsync(cancellationToken);
                            _logger.LogWarning("Failed to associate family {FamilyCode}. Status: {StatusCode}. Response: {Response}", 
                                familyCode, associationResponse.StatusCode, errorBody);
                            continue;
                        }

                        familyCount++;
                        _logger.LogDebug("      ✓ Family associated: {FamilyCode}", familyCode);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "      ✗ Failed to associate family {FamilyCode}", familyCode);
                    }
                }
            }

            _logger.LogInformation("  ✓ Associated {FamilyCount} families to product model", familyCount);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "✗ Failed to create product model");
            throw;
        }
    }

    /// <summary>
    /// Auto-extract families and features from BOM hierarchy.
    /// Each BOM node with children becomes a family, and its children become features.
    /// </summary>
    private void ExtractFamiliesFromBom(TcBomNode node, Dictionary<string, List<string>> familiesAndFeatures)
    {
        if (node?.Children == null || node.Children.Length == 0)
            return;

        // Check if this node's children could be features (leaf nodes or nodes with the same depth)
        var hasLeafChildren = node.Children.Any(c => c.Children == null || c.Children.Length == 0);
        
        if (hasLeafChildren && node.Children.Length > 1)
        {
            // This node represents a family, its children are features
            var familyName = ExtractNodeName(node.Name);
            var featureNames = node.Children
                .Select(c => ExtractNodeName(c.Name))
                .Where(n => !string.IsNullOrEmpty(n))
                .Distinct()
                .ToList();

            if (featureNames.Count > 0)
            {
                familiesAndFeatures[familyName] = featureNames;
                _logger.LogDebug("  Extracted family {FamilyName} with {FeatureCount} features", familyName, featureNames.Count);
            }
        }

        // Recursively process children
        foreach (var child in node.Children ?? [])
        {
            ExtractFamiliesFromBom(child, familiesAndFeatures);
        }
    }

    /// <summary>
    /// Extract meaningful name from BOM node name.
    /// Example: "000577/A;1-Body (View)" -> "Body (View)"
    /// </summary>
    private string ExtractNodeName(string fullName)
    {
        if (string.IsNullOrEmpty(fullName))
            return "";

        // Split by '-' and take the last part (usually the descriptive name)
        var parts = fullName.Split('-');
        if (parts.Length > 1)
            return parts.Last().Trim();

        // Otherwise, split by '/' and take descriptive parts
        var beforeSemicolon = fullName.Split(';')[0];
        var namePart = beforeSemicolon.Split('/')[0];
        return namePart.Trim();
    }

    private async Task CreateRulesAsync(
        int workItemId,
        string productCode,
        List<VariantRuleData> variantRules,
        CancellationToken cancellationToken)
    {
        try
        {
            // Create effectivity range for rules
            var effectivityStartEventCode = $"{productCode}_START";
            var effectivityEndEventCode = $"{productCode}_END";

            foreach (var rule in variantRules)
            {
                _logger.LogInformation("  Creating rule: {RuleId} ({LogicType})", rule.RuleId, rule.LogicType);

                // Build rule description showing conditions and logic
                var conditionTexts = rule.Conditions
                    .Select(c => $"{NormalizeName(c.OptionName)}={NormalizeName(c.OptionValue)}")
                    .ToList();
                var logicOperator = rule.LogicType.Equals("Or", StringComparison.OrdinalIgnoreCase) ? "OR" : "AND";
                var explanationText = string.Join($" {logicOperator} ", conditionTexts);

                var ruleDescription = $"Reject when {explanationText}.";
                if (!string.IsNullOrWhiteSpace(rule.Message) && !rule.Message.Equals("Rule", StringComparison.OrdinalIgnoreCase))
                {
                    ruleDescription += $" Reason: {rule.Message}";
                }

                // Build the rule expression in LML format
                // LML format: FAMILY in {"VALUE"} or FAMILY in {"VALUE"}
                var conditions = rule.Conditions
                    .Select(c => $"{NormalizeName(c.OptionName)} in {{\"{NormalizeName(c.OptionValue)}\"}}")
                    .ToList();

                string innerExpression;
                if (conditions.Count == 1)
                {
                    innerExpression = conditions[0];
                }
                else if (rule.LogicType.Equals("Or", StringComparison.OrdinalIgnoreCase))
                {
                    innerExpression = string.Join(" or ", conditions);
                }
                else
                {
                    innerExpression = string.Join(" and ", conditions);
                }

                // Convert PLMXML variant rules to exclusion rules: reject when the condition combination is met.
                string ruleExpression = $"not ({innerExpression})";

                _logger.LogInformation("    Rule expression: {Expression}", ruleExpression);
                _logger.LogInformation("    Rule description: {Description}", ruleDescription);

                // Create rule with correct API payload structure matching Python reference
                var rulePayload = new
                {
                    code = rule.RuleId.ToUpperInvariant(),
                    description = ruleDescription,
                    type = "Text",
                    intent = "Engineering",
                    text = ruleExpression,
                    effectivity = new
                    {
                        startEventCode = effectivityStartEventCode,
                        endEventCode = effectivityEndEventCode
                    },
                    labels = new[] { "PLM" },
                    isEnabled = true,
                    isLocked = false,
                    isPropagated = false
                };

                var ruleJson = JsonSerializer.Serialize(rulePayload);
                _logger.LogDebug("  Rule payload: {Payload}", ruleJson);
                var ruleContent = new StringContent(ruleJson, Encoding.UTF8, "application/json");

                var ruleUrl = $"api/v1/wi/{workItemId}/products/productmodels/{productCode}/rules";
                _logger.LogInformation("  Rule API URL: {Url}", ruleUrl);
                _logger.LogInformation("  Rule JSON payload: {Payload}", ruleJson);

                var ruleResponse = await _httpClient.PostAsync(
                    ruleUrl,
                    ruleContent,
                    cancellationToken);

                var responseContent = await ruleResponse.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogInformation("  Rule API Status: {StatusCode}", ruleResponse.StatusCode);
                _logger.LogInformation("  Rule API Response: {Response}", responseContent);

                if (!ruleResponse.IsSuccessStatusCode)
                {
                    _logger.LogError("✗ FAILED to create rule {RuleId}. Status: {StatusCode}. Response: {Response}", 
                        rule.RuleId, ruleResponse.StatusCode, responseContent);
                    
                    // Try to extract error details from response
                    try
                    {
                        var errorJson = JsonSerializer.Deserialize<JsonElement>(responseContent);
                        if (errorJson.TryGetProperty("errors", out var errorsElement))
                        {
                            _logger.LogError("  Error details: {ErrorDetails}", errorsElement.ToString());
                        }
                    }
                    catch { }
                    
                    continue;
                }

                _logger.LogInformation("    ✓ Rule created: {RuleId}", rule.RuleId);
            }

            _logger.LogInformation("  ✓ Created {RuleCount} rules in work item", variantRules.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "✗ Failed to create rules");
            throw;
        }
    }

    /// <summary>
    /// Normalizes names to codes by removing special characters and converting to UPPERCASE.
    /// API only accepts: A-Z, 0-9, hyphen, underscore (no lowercase letters)
    /// </summary>
    private string NormalizeName(string name)
    {
        if (string.IsNullOrEmpty(name))
            return "UNKNOWN";

        // Replace spaces and special chars with underscores, convert to UPPERCASE
        var normalized = System.Text.RegularExpressions.Regex.Replace(name, @"[^\w]", "_").ToUpperInvariant();
        
        // Remove leading/trailing underscores
        normalized = normalized.Trim('_');
        
        // If starts with digit, prepend underscore (API doesn't allow leading digits)
        if (!string.IsNullOrEmpty(normalized) && char.IsDigit(normalized[0]))
        {
            normalized = "_" + normalized;
        }
        
        return normalized;
    }
}
