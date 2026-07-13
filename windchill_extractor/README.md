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
