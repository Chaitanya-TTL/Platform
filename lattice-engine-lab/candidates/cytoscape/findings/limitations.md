# Cytoscape limitations

- Canvas nodes scale better than React cards but carry less information directly.
- Extension typings are incomplete and require maintained declarations.
- Compound fCoSE layout quality and incremental stability must be judged in the real browser.
- Edge labels are intentionally contextual rather than always visible.
- Preserving positions can conflict with global overlap removal after large expansions.
- Heap and GPU measurement remain manual.
- The error-recovery button clears presentation state but catastrophic renderer recreation still relies on the outer remount control.
