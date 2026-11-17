# .NET Framework Target Decision

**Decision date:** 2026-11-17
**Decision:** Target `Orchestration.API`, its tests, and all AI Runtime projects at .NET 10 LTS (`net10.0`).

The platform owner confirmed that the API's target host supports .NET 10. The repository has no tracked deployment or CI definitions to independently verify the host image or CI SDK; this targeted retargeting therefore relies on that owner confirmation. The installed SDK is 10.0.303.

The API currently targets .NET 9, which is out of support on the decision date. Its test project already targets .NET 10. Retarget only the API and the new runtime projects; do not retarget unrelated platform projects.
