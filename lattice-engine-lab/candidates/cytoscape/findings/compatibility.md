# Cytoscape compatibility findings

The candidate targets React 19.2.4, Cytoscape 3.34.0, TypeScript 5.9.2, Vite 7.3.6, and the installed fCoSE, Cola, Dagre, ELK, and layout-utilities extensions. Cytoscape is integrated imperatively inside a React effect with explicit listener removal and `destroy()` cleanup. Event and layout extension typings require a local declaration boundary.
