# Lattice Next Tranche 2

- Install Graphology with `npm install graphology --save` before validation. ELK and React Flow are already present.
- Persistence schema advances from version 1 to version 2. Invalid or older state falls back to a fresh investigation.
- React Flow edges now bind `out` to `in`, use directional arrow markers, and support independent relationship selection.
- ELK layout is keyed only by visible structure and orientation. A monotonically increasing token rejects stale results.
- The old Lattice directories are not recreated. This bundle contains no legacy deletions because the supplied source snapshot confirms those directories were already removed.
