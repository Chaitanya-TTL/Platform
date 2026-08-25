# G6 compatibility findings

Target stack: G6 5.1.1, React 19.2.4, TypeScript 5.9.2, Vite 7.3.6, and Node types 26.1.2. G6 is wrapped imperatively in a React effect with explicit event cleanup and destroy. The integration uses a narrow dynamic boundary because G6's runtime API and style callbacks are broader than the experiment's canonical types.
