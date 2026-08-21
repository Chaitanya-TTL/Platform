# Cytoscape runtime evaluation

The browser records first render, selection, incremental expansion, path highlight, path isolation, layout switching, focus-fit, and camera restoration. Diagnostics expose renderer count, explicit listener count, and measurable rendered-node overlap pairs. Destroy and remount use Cytoscape `removeAllListeners()` and `destroy()`.
