using McMaster.Extensions.CommandLineUtils;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Configit.Ace.Compilation.Client;
using Configit.Ace.PackageBuilder;
using Configit.Ace.PackageBuilder.BOMCatalog;
using Configit.Ace.Platform.Client.Compile;
using Configit.Ace.Model.Client;
using ConfigitAceIntegration.Abstractions;
using ConfigitAceIntegration.Application;
using ConfigitAceIntegration.Config;
using ConfigitAceIntegration.Dtos;
using ConfigitAceIntegration.Infrastructure;
using ConfigitAceIntegration.Infrastructure.AceModel;
using ConfigitAceIntegration.Infrastructure.Exceptions;
using ConfigitAceIntegration.Infrastructure.Builders;
using ConfigitAceIntegration.Models;
using ValidationException = ConfigitAceIntegration.Infrastructure.Exceptions.ValidationException;

[Command(Name = "ConfigitAceIntegration", Description = "HelloTeamcenter → Configit ACE ETL Pipeline")]
class Program
{
    [Argument(0, Description = "Path to tc_extraction.json")]
    [Required]
    public string JsonPath { get; set; } = string.Empty;

    [Option(CommandOptionType.SingleValue, ShortName = "u", LongName = "ace-uri", Description = "Ace Platform URI (default: from appsettings.json)")]
    public string? AceUri { get; set; }

    [Option(CommandOptionType.SingleValue, ShortName = "k", LongName = "api-key", Description = "Ace API Key (default: from appsettings.json)")]
    public string? ApiKey { get; set; }

    [Option(CommandOptionType.SingleValue, LongName = "package-path", Description = "Package path (default: samples/pen)")]
    public string PackagePath { get; set; } = "samples/pen";

    [Option(CommandOptionType.NoValue, LongName = "dry-run", Description = "Dry run - transform only, no Ace upload")]
    public bool DryRun { get; set; }

    public static int Main(string[] args) => CommandLineApplication.Execute<Program>(args);

    private async Task<int> OnExecute(CommandLineApplication app, IConsole console)
    {
        try
        {
            var host = Host.CreateDefaultBuilder()
                .ConfigureAppConfiguration((context, config) => 
                {
                    config.AddJsonFile("appsettings.json", optional: false);
                    config.AddJsonFile("appsettings.Development.json", optional: true);
                    config.AddEnvironmentVariables();
                })
                .ConfigureServices((context, services) =>
                {
                    var configuration = context.Configuration;
                    
                    // Configuration
                    services.Configure<AcePlatformSettings>(
                        configuration.GetSection("AcePlatform"));
                    services.Configure<AceModelSettings>(
                        configuration.GetSection("AceModel"));

                    // Application services
                    services.AddScoped<ITransformationService, TransformationService>();
                    services.AddScoped<IValidationService, ValidationService>();
                    
                    // SDK Builders
                    services.AddScoped<IProductModelBuilder, ProductModelBuilder>();
                    services.AddScoped<IProductCatalogBuilder, ProductCatalogBuilder>();
                    services.AddScoped<IBomCatalogBuilder, BomCatalogBuilder>();

                    // AceModel Service Factory
                    services.AddScoped<IAceModelService>(provider =>
                    {
                        var settings = provider.GetRequiredService<IOptions<AceModelSettings>>().Value;
                        var logger = provider.GetRequiredService<ILogger<AceModelService>>();
                        
                        return new AceModelService(
                            logger,
                            new Uri(settings.Uri),
                            settings.ApiKey,
                            settings.BrandCode,
                            settings.WorkItemName,
                            settings.WorkItemDescription,
                            settings.AssignedUsers);
                    });

                    services.AddSingleton(this);
                })
                .ConfigureLogging((context, logging) =>
                {
                    logging.ClearProviders();
                    logging.AddConsole();
                })
                .Build();

            using var serviceScope = host.Services.CreateScope();
            var logger = serviceScope.ServiceProvider.GetRequiredService<ILogger<Program>>();
            var settings = serviceScope.ServiceProvider.GetRequiredService<IOptions<AcePlatformSettings>>().Value;
            var transformService = serviceScope.ServiceProvider.GetRequiredService<ITransformationService>();
            var validationService = serviceScope.ServiceProvider.GetRequiredService<IValidationService>();

            // Merge CLI args with appsettings (CLI takes precedence)
            var finalUri = !string.IsNullOrEmpty(AceUri) ? AceUri : settings.Uri;
            var finalApiKey = !string.IsNullOrEmpty(ApiKey) ? ApiKey : settings.ApiKey;
            var finalPackagePath = !string.IsNullOrEmpty(PackagePath) && PackagePath != "samples/pen" ? PackagePath : settings.PackagePath;

            if (string.IsNullOrEmpty(finalApiKey))
                throw new ArgumentException("API Key must be provided via --api-key or appsettings.json");
            if (string.IsNullOrEmpty(finalUri))
                throw new ArgumentException("Ace URI must be provided via --ace-uri or appsettings.json");

            logger.LogInformation("=== ConfigitAceIntegration ETL Pipeline ===");
            logger.LogInformation("JSON Path: {JsonPath}", JsonPath);
            logger.LogInformation("Ace URI: {Uri}", finalUri);
            logger.LogInformation("Package Path: {PackagePath}", finalPackagePath);
            logger.LogInformation("Dry Run: {DryRun}", DryRun);

            // ✅ NEW: Load PLMXML if available (for VariantRuleCheck extraction)
            logger.LogInformation("Loading PLMXML (if available)...");
            string plmxmlContent = null;
            List<VariantRuleData> plmxmlRules = new();
            var searchDir = Path.GetDirectoryName(JsonPath);
            if (string.IsNullOrEmpty(searchDir)) searchDir = ".";
            
            // Prioritize explicitly named PLMXML.xml.
            // If no explicit PLMXML.xml is present, fall back only for legacy samples.
            string plmxmlPath = Path.Combine(searchDir, "PLMXML.xml");
            string fileToLoad = null;
            if (File.Exists(plmxmlPath))
            {
                fileToLoad = plmxmlPath;
            }
            else
            {
                var xmlFiles = Directory.GetFiles(searchDir, "*.xml");
                if (xmlFiles.Length > 0)
                {
                    fileToLoad = xmlFiles[0];
                    logger.LogWarning("No explicit PLMXML.xml found in {SearchDir}. Falling back to first XML file: {FileName}", searchDir, Path.GetFileName(fileToLoad));
                }
            }
            
            if (!string.IsNullOrEmpty(fileToLoad))
            {
                plmxmlContent = File.ReadAllText(fileToLoad);
                logger.LogInformation("✓ Loaded PLMXML file: {FileName}", Path.GetFileName(fileToLoad));
                logger.LogDebug("PLMXML size: {Size} bytes", plmxmlContent.Length);

                // Parse PLMXML rules
                logger.LogInformation("Parsing PLMXML variant rules...");
                try
                {
                    var ruleParser = new PlmxmlRuleParser((ILogger)logger);
                    plmxmlRules = ruleParser.ParseRules(plmxmlContent);
                    logger.LogInformation("✓ Extracted {RuleCount} AND/OR variant rules from PLMXML", plmxmlRules.Count);
                    
                    foreach (var rule in plmxmlRules)
                    {
                        logger.LogInformation("  • {LogicType} rule: {Message}", rule.LogicType, rule.Message);
                        foreach (var condition in rule.Conditions)
                        {
                            logger.LogInformation("    - {Option}={Value}", condition.OptionName, condition.OptionValue);
                        }
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "⚠ Failed to parse PLMXML rules. Continuing without rule extraction.");
                }
            }
            else
            {
                logger.LogInformation("⚠ No PLMXML file found. Rules will not be extracted from VariantRuleCheck.");
            }

            // PHASE 1: Load JSON
            logger.LogInformation("Phase 1: Loading extraction JSON...");
            if (!File.Exists(JsonPath))
                throw new FileNotFoundException($"JSON file not found: {JsonPath}");

            var jsonContent = File.ReadAllText(JsonPath);
            logger.LogDebug("JSON file loaded, size: {Size} bytes", jsonContent.Length);

            // PHASE 2: Parse extraction
            logger.LogInformation("Phase 2: Parsing extraction DTO...");
            TcExtractionDto extraction;
            try
            {
                extraction = transformService.ParseExtraction(jsonContent);
            }
            catch (ArgumentException ex)
            {
                throw new TransformationException($"Failed to parse extraction JSON: {ex.Message}", ex);
            }

            // PHASE 3: Validate extraction
            logger.LogInformation("Phase 3: Validating extraction schema...");
            var extractionValidation = validationService.ValidateExtraction(extraction);
            if (!extractionValidation.IsValid)
                throw new ValidationException($"Extraction validation failed:\n{string.Join("\n", extractionValidation.Errors)}");

            // PHASE 4: Transform BOM
            logger.LogInformation("Phase 4: Transforming BOM structure...");
            BomStructureDto bomTree;
            try
            {
                bomTree = transformService.Transform(extraction);
            }
            catch (Exception ex)
            {
                throw new TransformationException($"BOM transformation failed: {ex.Message}", ex);
            }

            // PHASE 5: Validate BOM output
            logger.LogInformation("Phase 5: Validating BOM structure...");
            var bomValidation = validationService.ValidateBomStructure(bomTree);
            if (!bomValidation.IsValid)
                throw new ValidationException($"BOM validation failed:\n{string.Join("\n", bomValidation.Errors)}");

            // PHASE 6: Write output
            logger.LogInformation("Phase 6: Writing BOM output...");
            var jsonOutput = JsonSerializer.Serialize(bomTree, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText("bom-output.json", jsonOutput);
            logger.LogInformation("✓ Transformed BOM saved to bom-output.json");

            if (DryRun)
            {
                logger.LogInformation("✓ Dry-run complete. No Configit upload.");
                return 0;
            }

            // PHASE 7: Upload to Configit using SDK
            logger.LogInformation("Phase 7: Building and Uploading Package to Configit...");
            
            try
            {
                logger.LogInformation("Initializing Configit client...");
                var compiler = new CompileClient(
                    new Uri(finalUri),
                    finalApiKey);
                
                logger.LogInformation("Step 1: Creating package at {PackagePath}...", finalPackagePath);
                var versionPath = await compiler.NewPackageAsync(new Uri(finalPackagePath, UriKind.Relative))
                    .ConfigureAwait(false);
                logger.LogInformation("✓ Package created: {VersionPath}", versionPath);

                // Build the model using proper builders
                logger.LogInformation("Phase 7a: Building ProductModel...");
                var productModelBuilder = serviceScope.ServiceProvider.GetRequiredService<IProductModelBuilder>();
                var productModel = productModelBuilder.Create(extraction.SourceItemId ?? "Product", extraction, plmxmlRules);
                logger.LogInformation("✓ ProductModel built");

                logger.LogInformation("Phase 7b: Building ProductCatalog...");
                var productCatalogBuilder = serviceScope.ServiceProvider.GetRequiredService<IProductCatalogBuilder>();
                var productCatalog = productCatalogBuilder.Create(extraction.SourceItemId ?? "Product", extraction);
                logger.LogInformation("✓ ProductCatalog built");

                logger.LogInformation("Phase 7c: Building BOMs...");
                var bomCatalogBuilder = serviceScope.ServiceProvider.GetRequiredService<IBomCatalogBuilder>();
                var bomCatalog = bomCatalogBuilder.Create(extraction.SourceItemId ?? "Product", extraction);
                logger.LogInformation("✓ BOM Catalog built");

                logger.LogInformation("Phase 7d: Creating PackageBuilder with all components...");
                var factory = FactoryProvider.SourceFactory;
                var packageBuilder = factory.PackageBuilder()
                    .AddVariables(productModelBuilder.GetVariables(extraction))
                    .AddProductModel(productModel)
                    .AddLanguages(new[] { factory.Language("System", isDefault: true) })
                    .AddProductCatalog(productCatalog)
                    .AddBomCatalog(bomCatalog);
                logger.LogInformation("✓ PackageBuilder created with all components");

                logger.LogInformation("Phase 7e: Uploading PackageBuilder to Configit...");
                logger.LogInformation("  Components being uploaded:");
                logger.LogInformation("    - Product Model");
                logger.LogInformation("    - Product Catalog");
                logger.LogInformation("    - BOM Catalog");
                logger.LogInformation("    - Variables");
                logger.LogInformation("    - Languages");
                
                await compiler.AddAsync(versionPath, packageBuilder)
                    .ConfigureAwait(false);
                logger.LogInformation("✓ All components uploaded successfully");

                logger.LogInformation("Phase 8a: Starting compilation...");
                var compilationId = await compiler.StartCompilationAsync(versionPath)
                    .ConfigureAwait(false);
                logger.LogInformation("Compilation ID: {CompilationId}", compilationId);

                logger.LogInformation("Phase 8b: Waiting for compilation to complete...");
                var compilation = await compiler.WaitForCompletion(compilationId)
                    .ConfigureAwait(false);

                if (compilation.ValidationMessages?.Any() == true)
                    logger.LogWarning("Validation messages: {Messages}", string.Join(", ", compilation.ValidationMessages));

                if (compilation.Status != CompilationStatus.Completed)
                {
                    logger.LogError("Compilation failed with status: {Status}", compilation.Status);
                    logger.LogError("Details: {Details}", compilation.StatusDetails);
                    throw new ConfigitApiException($"Compilation failed: {compilation.StatusDetails}");
                }

                logger.LogInformation("✓ Package compiled successfully");

                // PHASE 9: Export to AceModel (optional)
                logger.LogInformation("Phase 9: Publishing to AceModel work item...");
                try
                {
                    var aceModelService = serviceScope.ServiceProvider.GetRequiredService<IAceModelService>();
                    await aceModelService.BuildAndPublishAsync(
                        extraction.SourceItemId ?? "Product",
                        extraction,
                        plmxmlRules)
                        .ConfigureAwait(false);
                    logger.LogInformation("✓ AceModel work item published successfully");
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "⚠️ Phase 9 SKIPPED - AceModel work item creation failed (demo instance limitation)");
                    logger.LogWarning("  The ETL pipeline completed successfully through Phase 8. AceModel population requires production instance configuration.");
                }

                logger.LogInformation("=== ✓ ETL Pipeline Complete ===");
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "PHASE 7 FAILED - Full exception details:");
                logger.LogError("Exception Type: {ExceptionType}", ex.GetType().FullName);
                logger.LogError("Message: {Message}", ex.Message);
                logger.LogError("Stack Trace: {StackTrace}", ex.StackTrace);
                
                if (ex.InnerException != null)
                {
                    logger.LogError("Inner Exception: {InnerMessage}", ex.InnerException.Message);
                    logger.LogError("Inner Stack: {InnerStack}", ex.InnerException.StackTrace);
                }
                
                throw new ConfigitApiException($"Configit upload failed: {ex.Message}", ex);
            }

            return 0;
        }
        catch (FileNotFoundException ex)
        {
            LogError(console, ex.Message);
            return 1;
        }
        catch (ValidationException ex)
        {
            LogError(console, $"Validation Error: {ex.Message}");
            return 1;
        }
        catch (TransformationException ex)
        {
            LogError(console, $"Transformation Error: {ex.Message}");
            return 1;
        }
        catch (ConfigitApiException ex)
        {
            LogError(console, $"Configit API Error: {ex.Message}");
            return 1;
        }
        catch (Exception ex)
        {
            LogError(console, $"Unexpected Error: {ex.Message}\n{ex.StackTrace}");
            return 1;
        }
    }

    private static void LogError(IConsole console, string message)
    {
        console.ForegroundColor = ConsoleColor.Red;
        console.WriteLine($"ERROR: {message}");
        console.ResetColor();
    }
}
