# Codebeamer Extractor

Standalone source-owned integration for dynamic Codebeamer requirement discovery, paginated extraction, normalization, synchronization, local lexical search, and on-demand enrichment.

## Architecture

Codebeamer REST API -> discovery -> requirement tracker classification -> paginated extraction -> normalized catalog -> local search -> OrchestrationPlatform adapter.

## Setup

1. Copy `.env.example` to `.env`.
2. Configure the Codebeamer URL and authentication.
3. Create a virtual environment.
4. Install with `pip install -e .[test]`.

## Planned commands

- `codebeamer-extractor discover`
- `codebeamer-extractor sync`
- `codebeamer-extractor search "steering"`
- `codebeamer-extractor item 1190`
- `codebeamer-extractor relations 1190`
- `codebeamer-extractor status`

No project, tracker, or item business ID may be hardcoded.
