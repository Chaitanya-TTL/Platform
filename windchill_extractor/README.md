# Windchill extractor

This folder contains a backend-first BOM extractor for Windchill that mirrors the structure used by the Configit extractor.

## Goals
- Call the Windchill OData endpoints for BOM extraction.
- Normalize the returned BOM into a JSON tree compatible with the existing viewer.
- Write a reusable extraction document such as `windchill_extraction.json`.

## Usage

1. Create and activate a virtual environment.
2. Install requirements:
   `pip install -r requirements.txt`
3. Run the extractor:
   `python extractor.py --part-id 572081 --product-name Bike --output windchill_extraction.json`

## Notes
- The initial implementation focuses on backend extraction and JSON output.
- Frontend integration can be added once the extraction file format is validated.

## Windchill extractor

Supports direct structure extraction, version discovery, historical structure extraction, and deterministic revision comparison.

### Environment

```text
WINDCHILL_HOSTNAME
WINDCHILL_USERNAME
WINDCHILL_PASSWORD
WINDCHILL_VERIFY_SSL=false
```

### Commands

```bash
python extractor.py --operation extract --part-id 628915 --output out.json
python extractor.py --operation versions --part-id 628915 --output versions.json
python extractor.py --operation structure --part-id 628915 --version A.2 --output a2.json
python extractor.py --operation compare --part-id 628915 --from-version A.1 --to-version A.2 --output diff.json
```

Live failures return errors. Revision comparison never substitutes bundled sample data.
