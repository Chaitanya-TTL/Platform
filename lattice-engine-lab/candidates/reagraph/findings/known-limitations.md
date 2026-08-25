# Known Limitations

- The 10,000-entity dataset requires an explicit two-step arm and load action.
- The spike uses native edge aggregation; it does not claim full hierarchical edge bundling.
- Lasso behavior depends on Reagraph's runtime selection behavior and requires browser verification.
- Camera restoration stores a focus set rather than private camera internals.
- Browser frame rate, GPU memory, heap, and WebGL resource counts are not claimed.
- 3D is intentionally excluded from the first implementation because no validated engineering task yet justifies its cognitive and accessibility cost.
- The installed Reagraph package exposes incomplete TypeScript package metadata in the isolated Linux validation environment; a narrow local declaration bridges the public API pending Windows build verification.
