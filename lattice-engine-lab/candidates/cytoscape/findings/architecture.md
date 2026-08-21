# Cytoscape architecture findings

Canonical graph truth, projection, filters, expansion state, focus, path state, and measurements remain in React and shared contracts. Cytoscape owns rendering, compound groups, selector state, traversal, shortest-path calculation, layouts, viewport, and canvas lifecycle. Compound parent nodes group domains without converting groups into business entities.
 