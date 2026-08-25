# Lattice Engine Laboratory

Isolated Phase 1 source foundation. It must remain outside `OrchestrationPlatform/frontend`.

## Setup

From the Platform repository root:

```powershell
Set-ExecutionPolicy -Scope Process Bypass; .\lattice-engine-lab\scripts\setup-lab.ps1
```

## Validation

```powershell
.\lattice-engine-lab\scripts\validate-lab.ps1
```

No dependencies are installed by setup or validation. Graphin is quarantined. Commercial packages are absent.
