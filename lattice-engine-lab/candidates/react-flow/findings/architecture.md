# React Flow baseline architecture findings

The spike keeps canonical entities, relationships, evidence classifications, filtering, path selection, and neighborhood projection outside React Flow components. React Flow owns viewport interaction, node rendering, edges, selection events, fit-view, and camera operations only. Stable domain-sector coordinates preserve node positions when neighborhoods expand. No universal renderer adapter was introduced.
 