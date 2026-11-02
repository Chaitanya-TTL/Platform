# Sprint 1A.3 Live Investigation Expectations

## Expectation audit

| Expected relationship | Supporting evidence in live investigation | Missing evidence | Reasonable expectation? |
|---|---|---|---|
| Windchill part → `operationally-represented-as` → SAP material | Windchill and SAP applications are present | No matching governed part/material identity evidence; no cross-system canonical pair; evaluator result `evidence-not-found` | NO for this saved snapshot |
| Windchill part → `configured-by` → Configit model | Windchill and Configit applications are present | No `WC-100`/`305` governed linkage evidence; no cross-system canonical pair; evaluator result `evidence-not-found` | NO for this saved snapshot |
| Windchill part → `specified-by` → Codebeamer requirement | Windchill and Codebeamer applications are present | No governed OSLC/reference evidence; no cross-system canonical pair; evaluator result `evidence-not-found` | NO for this saved snapshot |
| SAP material → Configit model | SAP and Configit applications are present | No governed membership/material-reference evidence; no cross-system canonical pair; evaluator result `evidence-not-found` | NO for this saved snapshot |
| Change Notice `CN-9001` → potential impact → `MAT-200` | Neither requested endpoint is in live selections/entities | `CN-9001` and `MAT-200` are absent | NO; benchmark data mismatch |

## Interpretation

Application presence is not relationship evidence. The active investigation
contains source coverage for four applications, but the live data does not
contain the exact endpoint identities or governing properties used by the
validated fixture and ontology rules.

## Finding

The benchmark expectations are reasonable for the synthetic validated fixture,
but not for the current saved live investigation. Treating them as guaranteed
live expectations would conflate source coverage with linkage evidence.
