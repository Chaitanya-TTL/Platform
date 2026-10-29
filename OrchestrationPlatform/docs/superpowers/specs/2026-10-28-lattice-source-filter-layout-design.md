# Lattice source filter layout

## Intent

Keep the Lattice search-source controls fully readable and clickable when the
search column is narrower than the viewport. The current five-column `xl` grid
shrinks each card until its label breaks or appears cut off.

## Goals and constraints

- Use responsive columns so cards wrap into fewer, wider columns as needed.
- Let cards fill the available row width without clipping source names.
- Preserve the existing source selection behavior, defaults, checkbox semantics,
  logos, and visual states.
- Keep the change limited to the source filter layout.

## Non-goals

- Change which sources are selected by default or how search selection works.
- Redesign the search form or recent-investigations panel.

## Approaches

- **Responsive minimum-width cards (selected):** wrap cards based on the
  available width; use more columns only when each card has enough room. This
  addresses the constrained search column without tying layout to viewport
  breakpoints.
- **Compact five-column row:** keep one row and reduce spacing/content, trading
  readability for density.
- **One full-width row per source:** maximizes card width but uses substantially
  more vertical space.

The user selected responsive wrapping. Implementation details, including the
minimum card width, are left to the builder, who should follow existing Tailwind
and test conventions.
