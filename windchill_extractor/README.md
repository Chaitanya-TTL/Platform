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

### Associated Change Notices

```bash
python extractor.py --operation change-impact --part-id 628915 --output change-impact.json
```

This scans the exact WTPart versions in the current product structure, follows `Changeables(...)/AffectedByObjects`, resolves Change Tasks and Change Notices, and returns a node-level direct/indirect impact map. It does not calculate BOM quantity changes.
