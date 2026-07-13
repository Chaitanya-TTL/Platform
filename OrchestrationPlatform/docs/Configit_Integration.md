# Configit Integration and BOM Preview Flow

## Summary

The Configit BOM preview uses a frontend-triggered Python extractor that calls the Configit solve endpoint, normalizes the solve response into a BOM tree, and then renders that tree in the browser. Unlike the Teamcenter job flow, this path is request-driven and preview-oriented.

## End-to-end flow

1. The user enters a Configit product ID in the UI.
2. The page stores the product ID and enables the Configit preview state.
3. The preview panel calls `/api/bom-configit?productId=<productId>`.
4. The Next.js API route locates the `configit_extractor` folder, finds Python, and runs `extractor.py` with the product ID.
5. The extractor calls the Configit solve API, normalizes the response into a consistent BOM structure, and writes JSON to disk.
6. The frontend transforms that JSON into a tree structure and renders the BOM hierarchy in the viewer.

## 1. Frontend trigger

Files:
- `OrchestrationPlatform/frontend/app/page.tsx`
- `OrchestrationPlatform/frontend/components/SourceBomPanel.tsx`
- `OrchestrationPlatform/frontend/components/ConfigitForm.tsx`

What happens:
- The home page stores the entered product ID in `configitProductId` and increments a refresh signal after submission.
- `SourceBomPanel` calls the API endpoint `/api/bom-configit?productId=...`.
- The panel then uses the `transformPayload` callback to create a tree node for the viewer.

## 2. Next.js API route

File:
- `OrchestrationPlatform/frontend/app/api/bom-configit/route.ts`

Responsibilities:
- Resolve the workspace path to the `configit_extractor` folder.
- Find an available Python executable.
- Invoke `extractor.py` with:
  - `--product-id <productId>`
  - `--output <configit_extraction.json>`
- Read the generated JSON and return it to the browser.

The route is dynamic, so each request re-runs the extractor and returns the latest BOM.

## 3. Configit extractor logic

File:
- `configit_extractor/extractor.py`

The extractor has three main stages:

### A. Load configuration
The script reads settings from `configit_extractor/config.py`:
- `BASE_URL`
- `API_KEY`
- `PACKAGE_PATH`
- `VERIFY`

### B. Call the Configit solve service
The extractor builds a request body with:
- `productId`
- `date`
- a `nodes` array containing a root node

It then sends a POST request to:
- `<BASE_URL>/solve`

The request includes:
- an API key header
- a `packagePath` query parameter
- a JSON body describing the required solve request

If the call succeeds, the service returns a solve payload that may contain nested BOM structures, node wrappers, or item lists.

### C. Normalize the payload into a common BOM tree
The extractor includes several normalization helpers:
- `_pick_first(...)`
- `_extract_quantity(...)`
- `_extract_children(...)`
- `normalize_node(...)`
- `normalize_solve_response(...)`

The normalization logic:
- finds identifiers such as `productId`, `bomItemId`, `nodeId`, `id`, or `itemId`
- extracts quantities from `quantity`, `qty`, `amount`, or `count`
- walks nested `children`, `nodes`, `items`, `bom`, `bomItems`, or `boms` arrays recursively
- flattens wrapper nodes when the response includes intermediate containers
- writes both the raw solve response and the normalized BOM output to disk

The resulting JSON has this shape:

```json
{
  "productId": "Screwjack_002403",
  "packagePath": "samples/usb",
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

## 4. Frontend rendering path

File:
- `OrchestrationPlatform/frontend/components/BomStreamViewer.tsx`

The frontend uses `getConfigitRoot(payload)` to turn the normalized extractor output into the tree format expected by the viewer.

The transformation logic:
- reads the `bom` array from the response
- creates tree nodes with `id`, `name`, `attributes`, and `children`
- flattens wrapper nodes when the Configit payload has intermediate containers
- builds the root node shown in the BOM viewer

## Files involved

- `configit_extractor/extractor.py`
- `configit_extractor/config.py`
- `configit_extractor/configit_extraction.json`
- `OrchestrationPlatform/frontend/app/api/bom-configit/route.ts`
- `OrchestrationPlatform/frontend/app/page.tsx`
- `OrchestrationPlatform/frontend/components/SourceBomPanel.tsx`
- `OrchestrationPlatform/frontend/components/BomStreamViewer.tsx`

## Example run

From the repository root:

```bash
python configit_extractor/extractor.py --product-id Screwjack_002403 --output configit_extraction.json
```

This creates:
- `configit_extractor/configit_extraction.json`
- `configit_extractor/configit_raw_response.json`

## How to test the UI flow

1. Start the frontend.
2. Choose the Configit source from the landing page.
3. Enter a valid product ID such as `Screwjack_002403`.
4. Confirm that the preview panel loads the BOM tree and shows expandable nodes.
5. If the external solve service is slow or unavailable, inspect the generated JSON files in the extractor folder for debugging.

## Notes

- The Configit path is preview-only in this platform; it does not use the Teamcenter background job workflow.
- The extractor writes a normalized JSON artifact that the UI consumes directly.
- The route supports `debug=1` so the raw Configit solve payload can be returned alongside the normalized JSON for troubleshooting.
