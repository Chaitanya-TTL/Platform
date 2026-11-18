namespace Lattice.AI.Runtime.Prompts;

public interface IPromptCatalog
{
    PromptBundle GetRequired(string id, string version);
}
