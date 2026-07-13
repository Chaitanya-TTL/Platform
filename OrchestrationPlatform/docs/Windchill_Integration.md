# Windchill Integration and BOM Preview Flow

## Summary

The Windchill BOM preview is driven by a frontend-triggered Python extractor rather than the Teamcenter .NET pipeline. The flow starts in the UI, calls a Next.js API route, runs the Windchill extractor script, normalizes the returned BOM payload, and finally renders the hierarchy in the BOM tree viewer.

## End-to-end flow

1. The user enters a Windchill part ID in the UI.
2. The home page stores the part ID, enables the Windchill preview state, and triggers the preview panel.
3. The preview panel calls the Next.js route `/api/bom-windchill?partId=<partId>`.
4. The route locates the Windchill extractor folder, finds a Python interpreter, and runs the extractor script with `--part-id` and `--output`.
5. The extractor fetches a BOM from Windchill, normalizes it into a common tree structure, writes JSON to disk, and returns the normalized JSON to the frontend.
6. The frontend uses the `getWindchillRoot` transformer to build a tree that the arborist-based viewer can render.

## 1. Frontend trigger

Files:
- `OrchestrationPlatform/frontend/app/page.tsx`
- `OrchestrationPlatform/frontend/components/SourceBomPanel.tsx`
- `OrchestrationPlatform/frontend/components/WindchillForm.tsx`

What happens:
- The page component stores the entered part ID in `windchillPartId` and increments a refresh signal after submission.
- `SourceBomPanel` calls the endpoint `/api/bom-windchill?partId=...`.
- The panel then uses the `transformPayload` callback to produce a tree node for rendering.

## 2. Next.js API route

File:
- `OrchestrationPlatform/frontend/app/api/bom-windchill/route.ts`

Responsibilities:
- Resolve the workspace path to the `windchill_extractor` folder.
- Find an available Python executable.
- Invoke `extractor.py` with:
  - `--part-id <partId>`
  - `--output <windchill_extraction.json>`
- Read the generated JSON and return it to the browser.

This route is intentionally dynamic so the extractor runs on every request and the latest BOM is always fetched.

## 3. Windchill extractor logic

File:
- `windchill_extractor/extractor.py`

The extractor has three main stages:

### A. Load configuration
The script reads settings from `windchill_extractor/config.py`:
- `HOSTNAME`
- `USERNAME`
- `PASSWORD`
- `VERIFY_SSL`
- `DEFAULT_PART_ID`
- `DEFAULT_OUTPUT`

### B. Retrieve the BOM from Windchill
The extractor first calls the CSRF token endpoint:
- `http://<hostname>/Windchill/servlet/odata/PTC/GetCSRFToken()`

It then sends a POST request to the Windchill structure endpoint:
- `http://<hostname>/Windchill/servlet/odata/ProdMgmt/Parts('OR:wt.part.WTPart:<partId>')/PTC.ProdMgmt.GetPartStructure`

The request includes:
- `CSRF_NONCE`
- basic auth credentials
- `$expand=Components($levels=max)`

If the service is unavailable, the script falls back to a bundled sample payload from `sample_bom_payload.json` so the UI still has a deterministic response.

### C. Normalize the payload into a common BOM tree
The script normalizes the payload into a consistent structure:

```json
{
  "productId": "572081",
  "productName": "Bike",
  "generatedDate": "2025-01-01T00:00:00.000Z",
  "bom": [
    {
      "id": "...",
      "name": "...",
      "quantity": "...",
      "attributes": {},
      "children": []
    }
  ]
}
```

The normalization logic:
- reads `PartId`, `PartName`, `PartNumber`, and similar fields
- extracts quantities from `quantity`, `qty`, or similar fields
- walks `Components`/`components`/`children` arrays recursively
- writes both the raw response and normalized output to disk

## 4. Frontend rendering path

File:
- `OrchestrationPlatform/frontend/components/BomStreamViewer.tsx`

The frontend does not render the raw Windchill payload directly. Instead, it uses `getWindchillRoot(payload)` to transform the normalized JSON into a tree format understood by the viewer.

The transformation logic:
- reads the `bom` array from the response
- turns each BOM node into a viewer node with `id`, `name`, `attributes`, and `children`
- returns the top-level root node for the tree viewer

This is what allows the BOM to show as an expandable hierarchy in the UI.

## Files involved

- `windchill_extractor/extractor.py`
- `windchill_extractor/config.py`
- `windchill_extractor/sample_bom_payload.json`
- `OrchestrationPlatform/frontend/app/api/bom-windchill/route.ts`
- `OrchestrationPlatform/frontend/app/page.tsx`
- `OrchestrationPlatform/frontend/components/SourceBomPanel.tsx`
- `OrchestrationPlatform/frontend/components/BomStreamViewer.tsx`

## Example run

From the repository root:

```bash
python windchill_extractor/extractor.py --part-id 576218 --output windchill_extraction.json
```

This creates:
- `windchill_extractor/windchill_extraction.json`
- `windchill_extractor/windchill_extraction_raw.json`

## How to test the UI flow

1. Start the frontend.
2. Choose the Windchill source from the landing page.
3. Enter a valid part ID such as `576218`.
4. Confirm that the preview panel loads the BOM tree and shows expandable nodes.
5. If the Windchill service is unavailable, the extractor should still return the bundled sample payload and render a fallback tree.

## Notes

- The Windchill path is preview-only in this platform; it does not use the background pipeline job system from Teamcenter.
- The extractor writes a normalized JSON artifact that is reused by the frontend and can be debugged independently of the UI.
- The route supports `debug=1` so the raw Windchill response can be returned alongside the normalized output for troubleshooting.
