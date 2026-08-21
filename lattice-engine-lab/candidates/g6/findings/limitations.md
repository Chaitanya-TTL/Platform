# G6 limitations

- Some G6 APIs vary by renderer and layout package, so browser verification is mandatory.
- The current grouping uses combos with restrained styling, not production visual design.
- Camera translation needs validation against G6 viewport-coordinate semantics.
- Position preservation is best-effort and may conflict with overlap-removing layouts.
- Edge labels are contextual and depend on element-state support.
- Heap, GPU memory, and automated lifecycle testing remain outside the current harness.
