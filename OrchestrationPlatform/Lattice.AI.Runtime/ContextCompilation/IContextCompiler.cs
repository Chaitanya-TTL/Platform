using Lattice.AI.Runtime.Contracts.Context;

namespace Lattice.AI.Runtime.ContextCompilation;

public interface IContextCompiler
{
    ContextCompilationResult Compile(ContextCompilationInput input);
}
