# SAP Integration and BOM Preview Flow

## Summary

The SAP BOM preview uses a frontend-triggered .NET background job that launches a Java-based SAP JCo extractor, executes the SAP RFC function `CSAP_MAT_BOM_READ`, normalizes the returned SAP BOM header and component tables into the platform's common BOM JSON structure, and renders the resulting hierarchy in the browser.

Unlike the request-driven Windchill and Configit preview flows, SAP uses the asynchronous pipeline workflow already established for Teamcenter.

The SAP integration supports:

- Dynamic Material ID input from the frontend
- Background extraction jobs
- Server-Sent Events for extraction progress
- SAP JCo connectivity
- SAP RFC execution
- Normalized JSON generation
- BOM tree rendering through `react-arborist`
- BOM search and metrics
- Comparison support
- Impact Analysis support
- Constellation, radial, and three-dimensional visualization support

## End-to-end flow

1. The user adds SAP as an ERP source in the BOM workspace.
2. The user enters an SAP Material ID in `SAPForm.tsx`.
3. The SAP form sends a POST request to `/api/pipeline/start` with:
   - `kind: "sap"`
   - `materialId: "<Material ID>"`
4. The .NET API validates the request and creates a background extraction job.
5. The frontend receives the generated job ID.
6. The frontend subscribes to the job's Server-Sent Events progress stream.
7. The .NET pipeline routes the request to the SAP subprocess execution path.
8. The backend locates the sibling `SAP-BOM-Extractor` directory.
9. The backend verifies that the required SAP configuration, JCo JAR, native DLL, source, and compiled class files exist.
10. The backend compiles `SapBomExtractor.java` when the source is newer than the compiled class.
11. The backend launches the Java extractor with the Material ID and SAP BOM parameters.
12. The Java extractor loads the SAP JCo configuration from `config/sap.properties`.
13. The Java extractor connects to SAP and executes `CSAP_MAT_BOM_READ`.
14. SAP returns:
    - `T_STKO` for BOM header information
    - `T_STPO` for direct BOM components
15. The Java extractor normalizes the SAP tables into the platform's `BomRoot` JSON structure.
16. The extractor writes `sap_bom_extraction.json`.
17. The .NET backend reads and deserializes the generated JSON.
18. The final BOM is stored in the job audit log.
19. The frontend polls `/api/pipeline/bom/<jobId>` until the final BOM is available.
20. The frontend converts the SAP BOM response into `TreeNodeData`.
21. `SourceBomPanel` renders the normalized SAP hierarchy through `react-arborist`.
22. The SAP BOM is registered with the workspace for comparison, visualization, and Impact Analysis.

## Architecture overview

```text
SAPForm.tsx
    ↓
POST /api/pipeline/start
    ↓
PipelineController
    ↓
Background job creation
    ↓
PipelineOrchestrator
    ↓
SubprocessExecutor.ExecuteSapAsync()
    ↓
SapBomExtractor.java
    ↓
SAP JCo
    ↓
CSAP_MAT_BOM_READ
    ↓
T_STKO + T_STPO
    ↓
sap_bom_extraction.json
    ↓
.NET BomRoot deserialization
    ↓
GET /api/pipeline/bom/<jobId>
    ↓
SAP TreeNodeData transformation
    ↓
SourceBomPanel
    ↓
react-arborist
```

## 1. Frontend trigger

Files:

- `OrchestrationPlatform/frontend/components/SAPForm.tsx`
- `OrchestrationPlatform/frontend/lib/api.ts`
- `OrchestrationPlatform/frontend/app/bom-comparison/page.tsx`

### SAP form

File:

- `OrchestrationPlatform/frontend/components/SAPForm.tsx`

The SAP form provides the Material ID input and starts the extraction workflow.

The form accepts:

- `onSubmit`
- `isLoading`

The user enters an SAP Material ID, for example:

```text
PLM001007
```

The form validates that the Material ID is not empty.

If validation succeeds, the form calls:

```typescript
startSapExtraction({
  materialId: value
});
```

The extraction button uses the existing `StatefulButtonDemo` component.

During extraction:

- The Material ID input is disabled.
- The button displays a running state.
- Duplicate submissions are prevented.
- API errors are displayed in the SAP source card.

When the API returns a job ID, the form passes it to the workspace:

```typescript
onSubmit(result.jobId);
```

### SAP API request

File:

- `OrchestrationPlatform/frontend/lib/api.ts`

The SAP API helper sends the request to the existing pipeline endpoint:

```text
POST /api/pipeline/start
```

Request body:

```json
{
  "kind": "sap",
  "materialId": "PLM001007"
}
```

The helper also supports optional SAP BOM parameters:

```typescript
{
  materialId: string;
  plant?: string;
  bomUsage?: string;
  alternative?: string;
}
```

The initial frontend uses only the Material ID. The backend supplies the default values for the other SAP inputs.

Default values:

```text
Plant: 1001
BOM Usage: 3
Alternative BOM: 1
```

The API returns a job response similar to:

```json
{
  "success": true,
  "jobId": "job_PLM001007_972fd5da",
  "kind": "sap",
  "message": "Extraction started successfully"
}
```

## 2. SAP workspace state

File:

- `OrchestrationPlatform/frontend/app/bom-comparison/page.tsx`

The BOM comparison workspace maintains SAP-specific execution state independently from Teamcenter, Windchill, and Configit.

The SAP state includes:

```typescript
const [sapJob, setSapJob] = useState<string | null>(null);
const [sapRun, setSapRun] = useState(false);
const [sapProgress, setSapProgress] =
  useState<PipelineProgress | null>(null);
```

When `SAPForm` returns a job ID:

```typescript
setSapJob(id);
setSapRun(true);
setSapProgress(null);
```

The workspace then subscribes to the SAP job's progress channel:

```typescript
subscribeToProgress(
  sapJob,
  setSapProgress,
  errorHandler,
  completionHandler
);
```

The SAP progress state is independent from the Teamcenter progress state. This allows SAP and Teamcenter to retain their own job IDs, loading states, and progress messages.

When SAP is removed from the workspace, the SAP-specific state is cleared:

```typescript
setSapJob(null);
setSapRun(false);
setSapProgress(null);
```

This prevents an old SAP job from being reused if the source is removed and later added again.

## 3. Pipeline request model

File:

- `OrchestrationPlatform/Orchestration.API/Models/PipelineRequest.cs`

The extraction type enumeration includes SAP:

```csharp
public enum ExtractionKind
{
    Teamcenter,
    Configit,
    Sap
}
```

The extraction request supports these SAP fields:

```csharp
public string? MaterialId { get; set; }
public string? Plant { get; set; }
public string? BomUsage { get; set; }
public string? Alternative { get; set; }
```

The request identifier logic recognizes the SAP Material ID:

```csharp
public string? GetIdentifier()
```

For SAP extraction jobs, the Material ID is used when generating the job identifier.

Example job ID:

```text
job_PLM001007_972fd5da
```

## 4. Pipeline controller

File:

- `OrchestrationPlatform/Orchestration.API/Controllers/PipelineController.cs`

The pipeline controller exposes the shared extraction endpoint:

```text
POST /api/pipeline/start
```

### SAP validation

When the request kind is SAP, `MaterialId` is mandatory.

If the Material ID is missing, the controller returns:

```json
{
  "success": false,
  "message": "MaterialId is required"
}
```

### Job creation

For a valid SAP request, the controller:

1. Creates a pipeline job.
2. Assigns the generated job ID to the extraction request.
3. Initializes the progress channel.
4. starts the extraction in a background task.
5. Returns the job ID immediately to the frontend.

The request does not remain open while SAP extraction is running.

This allows SAP connectivity and RFC execution to happen asynchronously.

### Background execution

The background task calls:

```csharp
_orchestrator.ExecutePipelineAsync(...)
```

If the pipeline result reports success, the job is marked as completed.

If the pipeline result reports failure, the job is marked as failed.

### BOM retrieval

The frontend retrieves the final SAP BOM through:

```text
GET /api/pipeline/bom/<jobId>
```

If the job exists but the final BOM is not ready, the endpoint returns a not-found response containing the current job status.

`SourceBomPanel` interprets this as a temporary pending state and continues polling.

Once the final SAP BOM is available, the endpoint returns:

```json
{
  "success": true,
  "jobId": "job_PLM001007_972fd5da",
  "status": "success",
  "finalBom": {
    "bomRoot": {
      "itemId": "PLM001007",
      "name": "PLM001007",
      "qty": "1 EA",
      "children": []
    },
    "sourceItemId": "PLM001007",
    "sourceRevId": "",
    "variantOptions": {},
    "extractedAt": "2026-07-21T09:28:07.401Z"
  }
}
```

## 5. Pipeline orchestration

File:

- `OrchestrationPlatform/Orchestration.API/Services/PipelineOrchestrator.cs`

The pipeline orchestrator manages:

- Progress phases
- Progress channels
- Subprocess execution
- Audit logging
- Final BOM storage
- Success and failure reporting

### Source-aware progress

The SAP pipeline uses source-aware progress messages.

Typical SAP phases include:

```text
Connecting to SAP...
Executing SAP extraction...
Starting SAP extraction for material PLM001007...
SAP connection established.
Executing CSAP_MAT_BOM_READ...
SAP BOM JSON created...
Finalizing...
Pipeline completed successfully!
```

The pipeline uses these general phases:

```text
extract
transform
load
```

If an error occurs, the pipeline reports:

```text
error
```

### Server-Sent Events

The progress channel is exposed through:

```text
GET /api/pipeline/progress/<jobId>
```

The frontend subscribes using `EventSource`.

Each progress event contains:

```json
{
  "jobId": "job_PLM001007_972fd5da",
  "phase": "transform",
  "status": "in_progress",
  "progressPercent": 70,
  "message": "Executing CSAP_MAT_BOM_READ...",
  "timestamp": "2026-07-21T09:29:44.000Z"
}
```

The progress channel closes when the pipeline completes or fails.

### Audit logging

The orchestrator writes an audit log when the job begins and updates it after completion.

Audit logs are stored under the backend runtime output directory:

```text
OrchestrationPlatform/Orchestration.API/bin/Debug/net9.0/Logs/
```

Example audit log:

```text
audit_job_PLM001007_972fd5da_20260721_092949.json
```

The completed audit log stores:

- Job ID
- Source identifier
- Start time
- End time
- Pipeline status
- Extraction phases
- Final BOM
- Output file path
- Output source kind
- Error information, if applicable

## 6. SAP subprocess execution

File:

- `OrchestrationPlatform/Orchestration.API/Services/SubprocessExecutor.cs`

The subprocess executor routes SAP requests through:

```csharp
ExecuteSapAsync(...)
```

The Teamcenter and Configit execution paths remain separate.

### Workspace resolution

The backend calculates the shared workspace root from the .NET application's runtime directory.

The relevant projects are siblings:

```text
Platform/
├── configit_extractor/
├── OrchestrationPlatform/
├── SAP-BOM-Extractor/
├── TeamCenter-to-Configit-soa_client/
└── windchill_extractor/
```

The SAP extractor directory is resolved as:

```text
Platform/SAP-BOM-Extractor
```

### Required SAP runtime files

Before starting extraction, the backend verifies the presence of:

```text
SAP-BOM-Extractor/
├── config/
│   └── sap.properties
├── lib/
│   ├── sapjco3.jar
│   └── sapjco3.dll
├── out/
│   └── SapBomExtractor.class
└── src/
    └── SapBomExtractor.java
```

If a required file is unavailable, the pipeline returns a specific error instead of silently failing.

### Stale JSON cleanup

Before each SAP extraction, the executor removes the previous output file:

```text
SAP-BOM-Extractor/sap_bom_extraction.json
```

This ensures that the backend never returns stale output from an earlier Material ID.

### Automatic Java compilation

The executor compares the modification times of:

```text
src/SapBomExtractor.java
out/SapBomExtractor.class
```

The Java extractor is compiled when:

- The compiled class does not exist, or
- The Java source is newer than the compiled class

The equivalent compilation command is:

```powershell
javac -cp ".\lib\sapjco3.jar" -d .\out .\src\SapBomExtractor.java
```

This allows updated Java source code to be picked up without requiring a manual compilation before every backend run.

The machine running the .NET API must have both `java` and `javac` available through the system `PATH`.

### Java execution

The backend launches the SAP extractor with arguments equivalent to:

```powershell
java "-Djava.library.path=lib" `
  -cp "out;lib\sapjco3.jar" `
  SapBomExtractor `
  PLM001007 `
  1001 `
  3 `
  1 `
  sap_bom_extraction.json
```

The arguments are:

```text
Argument 0: Material ID
Argument 1: Plant
Argument 2: BOM Usage
Argument 3: Alternative BOM
Argument 4: Output JSON path
```

The backend uses `ProcessStartInfo.ArgumentList` to pass arguments safely.

This avoids command-line quoting problems when the workspace path contains spaces, such as a OneDrive directory.

### Native SAP JCo library

The Java process receives:

```text
-Djava.library.path=<SAP-BOM-Extractor>/lib
```

This allows the SAP JCo JAR to load:

```text
sapjco3.dll
```

The classpath includes:

```text
SAP-BOM-Extractor/out
SAP-BOM-Extractor/lib/sapjco3.jar
```

### Process output

The executor captures:

- Standard output
- Standard error
- Process exit code

Java output lines are forwarded into the pipeline progress channel.

If the Java process exits with a nonzero status, the SAP pipeline is treated as failed.

If the process exits successfully but the expected JSON file does not exist, the pipeline is also treated as failed.

## 7. SAP extractor logic

File:

- `SAP-BOM-Extractor/src/SapBomExtractor.java`

The Java extractor is responsible for:

- Loading SAP connection properties
- Registering the SAP JCo destination
- Connecting to SAP
- Executing the BOM RFC
- Reading SAP BOM tables
- Normalizing the BOM structure
- Writing valid JSON
- Returning a reliable process exit code

### A. Runtime inputs

The extractor accepts runtime arguments:

```text
Material ID
Plant
BOM Usage
Alternative BOM
Output file
```

Defaults are available for local testing:

```text
Material ID: PLM001007
Plant: 1001
BOM Usage: 3
Alternative: 1
Output: sap_bom_extraction.json
```

The Material ID provided by `SAPForm.tsx` replaces the previous hardcoded-only execution behavior.

### B. Load SAP JCo configuration

The extractor loads:

```text
SAP-BOM-Extractor/config/sap.properties
```

Expected property keys include:

```properties
jco.client.ashost=<SAP application server>
jco.client.sysnr=<SAP system number>
jco.client.client=<SAP client>
jco.client.user=<SAP technical user>
jco.client.passwd=<SAP password>
jco.client.lang=EN

jco.destination.pool_capacity=3
jco.destination.peak_limit=10
```

The extractor validates mandatory properties before opening the SAP connection.

Mandatory properties:

```text
jco.client.ashost
jco.client.sysnr
jco.client.client
jco.client.user
jco.client.passwd
```

The properties file must not be committed to source control.

### C. Register the SAP destination

The extractor registers a local implementation of:

```java
DestinationDataProvider
```

The destination name is:

```text
S4H_DESTINATION
```

The registered destination supplies the loaded JCo properties to:

```java
JCoDestinationManager
```

### D. Test the SAP connection

The extractor retrieves the destination and performs:

```java
destination.ping();
```

If the SAP system is reachable and the credentials are valid, the extractor proceeds to RFC execution.

Typical success output:

```text
Starting SAP BOM extraction for material PLM001007...
SAP connection established.
```

### E. Retrieve the SAP RFC

The extractor retrieves:

```text
CSAP_MAT_BOM_READ
```

If the RFC does not exist or is unavailable to the SAP user, the extractor throws an error and exits with a nonzero status.

### F. Set RFC import parameters

The extractor sets:

```text
MATERIAL
PLANT
BOM_USAGE
ALTERNATIVE
VALID_FROM
VALID_TO
CHANGE_NO
```

The validated extraction used:

```text
MATERIAL = PLM001007
PLANT = 1001
BOM_USAGE = 3
ALTERNATIVE = 1
```

The date and change-number parameters are currently submitted as blank values:

```text
VALID_FROM = blank
VALID_TO = blank
CHANGE_NO = blank
```

### G. Execute the RFC

The extractor calls:

```java
function.execute(destination);
```

The validated SAP system returned:

```text
T_STKO row count: 1
T_STPO row count: 2
```

## 8. SAP response tables

The RFC returns multiple table parameters. The initial integration uses:

```text
T_STKO
T_STPO
```

### T_STKO: BOM header

`T_STKO` contains the BOM header information.

Relevant fields include:

```text
BASE_QUAN
BASE_UNIT
BOM_STATUS
BOM_NO
VALID_FROM
VALID_TO
CREATED_ON
CREATED_BY
```

Validated example:

```text
BASE_QUAN = 1
BASE_UNIT = EA
BOM_STATUS = 01
BOM_NO = 00000833
VALID_FROM = 13.07.2026
VALID_TO = 31.12.9999
```

The normalized root quantity is created from:

```text
BASE_QUAN + BASE_UNIT
```

Result:

```text
1 EA
```

### T_STPO: BOM components

`T_STPO` contains direct BOM components.

Relevant fields include:

```text
ITEM_CATEG
ITEM_NO
COMPONENT
COMP_QTY
COMP_UNIT
ITEM_TEXT1
ITEM_TEXT2
BOM_NO
ITEM_NODE
ITEM_GUID
VALID_FROM
VALID_TO
```

Validated component example:

```text
ITEM_NO = 0010
COMPONENT = PLM001008
COMP_QTY = 1
COMP_UNIT = EA
ITEM_TEXT1 = Child1
```

The second validated component was:

```text
ITEM_NO = 0020
COMPONENT = PLM001009
COMP_QTY = 1
COMP_UNIT = EA
ITEM_TEXT1 = Child2
```

## 9. SAP field normalization

The SAP extractor maps SAP fields into the platform's common BOM contract.

### Root mapping

```text
Platform field     SAP source
-----------------------------------------------
itemId             Requested MATERIAL
name               Requested MATERIAL
qty                T_STKO.BASE_QUAN + BASE_UNIT
children           Normalized T_STPO rows
sourceItemId       Requested MATERIAL
extractedAt        Current UTC timestamp
```

### Component mapping

```text
Platform field     SAP source
-----------------------------------------------
itemId             T_STPO.COMPONENT
name               T_STPO.ITEM_TEXT1
sequence           T_STPO.ITEM_NO
qty                T_STPO.COMP_QTY + COMP_UNIT
children           Empty array for direct components
```

If `ITEM_TEXT1` is empty, the component Material ID is used as the display name.

### Quantity normalization

SAP quantity values may contain leading spaces.

Example SAP value:

```text
COMP_QTY =                 1
```

The extractor:

1. Trims surrounding whitespace.
2. Parses the number when possible.
3. Removes unnecessary trailing zeroes.
4. Adds the unit of measure.

Example:

```text
SAP quantity: "                1"
SAP unit: "EA"
Normalized quantity: "1 EA"
```

## 10. Generated SAP JSON

The Java extractor writes:

```text
SAP-BOM-Extractor/sap_bom_extraction.json
```

Validated output:

```json
{
  "bomRoot": {
    "itemId": "PLM001007",
    "sequence": "",
    "variantState": "",
    "revId": "",
    "name": "PLM001007",
    "qty": "1 EA",
    "variantCondition": "",
    "children": [
      {
        "itemId": "PLM001008",
        "sequence": "0010",
        "variantState": "",
        "revId": "",
        "name": "Child1",
        "qty": "1 EA",
        "variantCondition": "",
        "children": []
      },
      {
        "itemId": "PLM001009",
        "sequence": "0020",
        "variantState": "",
        "revId": "",
        "name": "Child2",
        "qty": "1 EA",
        "variantCondition": "",
        "children": []
      }
    ]
  },
  "sourceItemId": "PLM001007",
  "sourceRevId": "",
  "variantOptions": {},
  "extractedAt": "2026-07-21T09:28:07.401Z"
}
```

The output shape intentionally matches the existing `.NET BomRoot` model.

This allows the backend to deserialize the SAP output without introducing a parallel SAP-only BOM response model.

## 11. Backend JSON deserialization

Files:

- `OrchestrationPlatform/Orchestration.API/Models/BomNode.cs`
- `OrchestrationPlatform/Orchestration.API/Services/SubprocessExecutor.cs`

After the Java process exits successfully, the backend:

1. Confirms that `sap_bom_extraction.json` exists.
2. Reads the complete JSON file.
3. Deserializes it using `JsonConvert`.
4. Verifies that `BomRootNode` is present.
5. Returns the `BomRoot` to `PipelineOrchestrator`.

The existing `BomNode` fields support the SAP data:

```text
ItemId
Sequence
VariantState
RevId
Name
Qty
VariantCondition
Children
```

The Java JSON property:

```json
"bomRoot"
```

maps to the .NET `BomRootNode` property through the existing JSON attribute.

## 12. Final BOM storage and retrieval

Once the SAP BOM is deserialized successfully, `PipelineOrchestrator` stores it in:

```csharp
auditLog.FinalBom
```

The audit log status changes to:

```text
success
```

The final BOM becomes available through:

```text
GET /api/pipeline/bom/<jobId>
```

The frontend does not read `sap_bom_extraction.json` directly.

Instead, the frontend reads the job-specific API response. This keeps the browser separated from local filesystem paths and Java runtime details.

## 13. Frontend polling

File:

- `OrchestrationPlatform/frontend/components/SourceBomPanel.tsx`

The SAP panel receives:

```typescript
endpoint={
  sapJob
    ? `${API_BASE}/pipeline/bom/${encodeURIComponent(sapJob)}`
    : ""
}
```

While the SAP job is running, `SourceBomPanel` requests the BOM endpoint.

If the final BOM is not ready, the panel waits and retries.

The default polling interval is:

```text
2000 milliseconds
```

When the backend returns a valid final BOM, the panel calls the SAP payload transformer.

The panel then:

```typescript
setBom(root);
onBomReady?.("sap", root);
setStatus("ready");
```

The SAP running state is cleared through:

```typescript
onLoadComplete={() => setSapRun(false)}
```

## 14. SAP frontend tree transformation

Files:

- `OrchestrationPlatform/frontend/app/bom-comparison/page.tsx`
- `OrchestrationPlatform/frontend/types/bom-comparison.ts`

The frontend transforms the backend `BomRoot` response into:

```typescript
type TreeNodeData = {
  id: string;
  name: string;
  attributes?: Record<string, string | number | boolean>;
  children?: TreeNodeData[];
};
```

### SAP payload lookup

The transformer supports the backend response shape:

```text
finalBom.bomRoot
```

It also checks compatible alternatives such as:

```text
finalBom.bomRootNode
bomRoot
bomRootNode
```

### SAP node transformation

Each SAP node becomes:

```typescript
{
  id: "unique-structural-id",
  name: "Child1",
  attributes: {
    "Item ID": "PLM001008",
    "Sequence": "0010",
    "Qty": "1 EA"
  },
  children: []
}
```

### Structural IDs

SAP business Material IDs are not used as the only tree node identifiers.

Instead, the frontend generates structural IDs containing the node path.

This prevents collisions when the same SAP component appears multiple times in different BOM positions.

The SAP Material ID is retained independently in:

```text
attributes["Item ID"]
```

This distinction is important:

```text
Tree node ID: Internal unique structural identity
SAP Item ID: Business Material ID used for display and comparison
```

## 15. BOM rendering through SourceBomPanel

File:

- `OrchestrationPlatform/frontend/components/SourceBomPanel.tsx`

The SAP BOM uses the same source-independent panel as Teamcenter, Windchill, and Configit.

Once the SAP payload is normalized, `SourceBomPanel` provides:

- Ready state
- Search
- Expand all
- Collapse all
- Full-screen mode
- BOM metrics
- Node selection
- Tree view
- Constellation view
- Radial explorer
- Three-dimensional universe
- Comparison highlighting
- Impact Analysis highlighting
- Light and dark theme support

No separate SAP-only tree component is required.

## 16. react-arborist rendering

`SourceBomPanel` passes the normalized SAP data to `react-arborist`.

The tree receives:

```typescript
data={bom ? [bom] : []}
```

The viewer displays:

```text
PLM001007
├── Child1
│   Item ID: PLM001008
└── Child2
    Item ID: PLM001009
```

The validated SAP preview reported:

```text
Items: 3
Assemblies: 1
Leaf components: 2
Levels: 2
```

These metrics are calculated dynamically from the normalized SAP tree.

## 17. SAP search behavior

SAP nodes participate in the existing BOM search.

The searchable text includes:

- Name
- Item ID
- Quantity
- All normalized attributes

Examples of valid search values include:

```text
PLM001007
PLM001008
Child1
Child2
1 EA
0010
0020
```

## 18. SAP comparison support

Files:

- `OrchestrationPlatform/frontend/lib/bom-comparison.ts`
- `OrchestrationPlatform/frontend/types/bom-comparison.ts`

SAP is already included in `SourceType`:

```typescript
export type SourceType =
  | "teamcenter"
  | "windchill"
  | "configit"
  | "sap";
```

When the SAP BOM becomes ready, the workspace registers it in:

```typescript
roots.sap
```

This makes SAP available in the existing comparison setup.

SAP can be compared with:

- Teamcenter
- Windchill
- Configit

The comparison engine can use:

- Item ID
- Name
- Quantity
- Parent context
- Hierarchy level
- Assembly or leaf type

Possible comparison results include:

```text
Matched
Changed
Missing
Source-only
Probable
```

Because the SAP Material ID is stored under `Item ID`, cross-system matching can use the business identifier instead of the internal structural node ID.

## 19. SAP Impact Analysis support

Files:

- `OrchestrationPlatform/frontend/components/SourceBomPanel.tsx`
- `OrchestrationPlatform/frontend/lib/cross-bom-impact-store.ts`

When the SAP tree is loaded, `SourceBomPanel` registers it with the Impact Analysis store.

The SAP BOM may then participate in cross-BOM searches.

For a selected SAP material, the platform can inspect:

- Whether the Material ID appears in other loaded BOMs
- Which parent assembly contains the material
- Which source contains the material
- How many occurrences exist
- Which loaded BOMs would be affected by a material change

SAP uses the same loaded-BOM impact framework as the other sources.

## 20. Advanced SAP visualizations

After the SAP BOM reaches the normalized `TreeNodeData` format, it automatically supports:

- Tree view
- Constellation view
- Radial explorer
- Three-dimensional universe

Relevant frontend components include:

```text
BomConstellationView
BomRadialExplorerView
BomThreeUniverseView
BomViewSwitcher
```

No visualization component requires direct SAP JCo knowledge.

Every visualization consumes the same normalized tree.

## Files involved

### SAP extractor

- `SAP-BOM-Extractor/src/SapBomExtractor.java`
- `SAP-BOM-Extractor/config/sap.properties`
- `SAP-BOM-Extractor/lib/sapjco3.jar`
- `SAP-BOM-Extractor/lib/sapjco3.dll`
- `SAP-BOM-Extractor/out/SapBomExtractor.class`
- `SAP-BOM-Extractor/sap_bom_extraction.json`

### .NET backend

- `OrchestrationPlatform/Orchestration.API/Models/PipelineRequest.cs`
- `OrchestrationPlatform/Orchestration.API/Models/BomNode.cs`
- `OrchestrationPlatform/Orchestration.API/Models/PipelineProgress.cs`
- `OrchestrationPlatform/Orchestration.API/Controllers/PipelineController.cs`
- `OrchestrationPlatform/Orchestration.API/Services/PipelineOrchestrator.cs`
- `OrchestrationPlatform/Orchestration.API/Services/SubprocessExecutor.cs`
- `OrchestrationPlatform/Orchestration.API/Services/JobStore.cs`
- `OrchestrationPlatform/Orchestration.API/Services/AuditLogger.cs`
- `OrchestrationPlatform/Orchestration.API/Program.cs`

### Frontend

- `OrchestrationPlatform/frontend/components/SAPForm.tsx`
- `OrchestrationPlatform/frontend/components/StatefulButton.tsx`
- `OrchestrationPlatform/frontend/components/SourceBomPanel.tsx`
- `OrchestrationPlatform/frontend/app/bom-comparison/page.tsx`
- `OrchestrationPlatform/frontend/lib/api.ts`
- `OrchestrationPlatform/frontend/lib/bom-comparison.ts`
- `OrchestrationPlatform/frontend/types/bom-comparison.ts`

## Example standalone compilation

From `SAP-BOM-Extractor`:

```powershell
javac -cp ".\lib\sapjco3.jar" `
  -d .\out `
  .\src\SapBomExtractor.java
```

This creates or updates:

```text
SAP-BOM-Extractor/out/SapBomExtractor.class
SAP-BOM-Extractor/out/SapBomExtractor$LocalDestinationProvider.class
```

## Example standalone extraction

From `SAP-BOM-Extractor`:

```powershell
java "-Djava.library.path=lib" `
  -cp "out;lib\sapjco3.jar" `
  SapBomExtractor `
  PLM001007 `
  1001 `
  3 `
  1 `
  sap_bom_extraction.json
```

Expected output:

```text
Starting SAP BOM extraction for material PLM001007...
SAP connection established.
Executing CSAP_MAT_BOM_READ...
SAP BOM JSON created: <path>\sap_bom_extraction.json
Extracted 2 direct component row(s).
SAP BOM extraction completed successfully.
```

## Inspect generated JSON

```powershell
Get-Content .\sap_bom_extraction.json -Raw |
  ConvertFrom-Json |
  ConvertTo-Json -Depth 20
```

## How to test the full UI flow

### 1. Compile the SAP extractor

```powershell
cd .\SAP-BOM-Extractor

javac -cp ".\lib\sapjco3.jar" `
  -d .\out `
  .\src\SapBomExtractor.java
```

### 2. Remove stale SAP output

From the repository root:

```powershell
Remove-Item `
  .\SAP-BOM-Extractor\sap_bom_extraction.json `
  -Force `
  -ErrorAction SilentlyContinue
```

This confirms that the UI generates a fresh SAP extraction.

### 3. Start the .NET backend

```powershell
cd .\OrchestrationPlatform\Orchestration.API

dotnet run
```

Expected local API address:

```text
http://localhost:5212
```

### 4. Start the frontend

In another terminal:

```powershell
cd .\OrchestrationPlatform\frontend

npm run dev
```

Expected frontend address:

```text
http://localhost:3000
```

### 5. Run SAP extraction from the workspace

1. Open the BOM comparison workspace.
2. Add SAP under the ERP category.
3. Enter:

```text
PLM001007
```

4. Click `Extract BOM`.
5. Confirm that the button moves into its running state.
6. Confirm that the backend creates a SAP job.
7. Confirm that `sap_bom_extraction.json` is recreated.
8. Confirm that the SAP panel changes to `READY`.
9. Expand the SAP root node.
10. Confirm that `Child1` and `Child2` are displayed.
11. Confirm the Material IDs:
    - `PLM001008`
    - `PLM001009`
12. Confirm the calculated metrics:
    - 3 items
    - 1 assembly
    - 2 leaves
    - 2 levels

## Validated backend output

A successful UI-triggered extraction produced backend logs similar to:

```text
Received pipeline start request. Kind=Sap, Identifier=PLM001007
Job created: job_PLM001007_972fd5da
Audit log written
Job completed: job_PLM001007_972fd5da
```

This confirms:

```text
Frontend request
→ SAP job creation
→ SAP extraction
→ JSON generation
→ Final BOM persistence
→ Successful job completion
```

## Error handling

The SAP workflow reports failures for conditions such as:

- Missing Material ID
- SAP extractor directory not found
- Missing `sap.properties`
- Missing `sapjco3.jar`
- Missing `sapjco3.dll`
- Missing Java source
- Java compilation failure
- Java runtime not available
- SAP JCo connection failure
- Invalid SAP credentials
- SAP authorization failure
- Missing RFC function
- No BOM header returned
- Missing `T_STPO`
- Nonzero Java process exit code
- Missing JSON output
- Invalid JSON output
- Missing normalized BOM root

Errors are reported through:

- Java standard error
- Backend logging
- Pipeline progress events
- Job audit logs
- Frontend toast messages
- `SourceBomPanel` error state

## Security considerations

The following files must not be committed to Git:

```text
SAP-BOM-Extractor/config/sap.properties
SAP-BOM-Extractor/lib/sapjco3.jar
SAP-BOM-Extractor/lib/sapjco3.dll
SAP-BOM-Extractor/out/
SAP-BOM-Extractor/sap_bom_extraction.json
```

Reasons:

- `sap.properties` contains SAP connectivity and authentication settings.
- SAP JCo binaries are proprietary SAP runtime files.
- `out/` contains generated Java build artifacts.
- `sap_bom_extraction.json` is generated runtime data.

The frontend never receives:

- SAP passwords
- SAP usernames
- SAP host configuration
- SAP JCo properties
- JCo binaries

The frontend sends only the Material ID and optional non-secret BOM parameters.

## Current scope and limitation

The current SAP RFC execution uses:

```text
CSAP_MAT_BOM_READ
```

The validated response provides:

```text
One BOM header
Direct BOM components
```

The current integration therefore represents a single-level SAP BOM:

```text
Requested material
├── Direct component
├── Direct component
└── Direct component
```

The current implementation does not recursively call SAP for child materials.

A true multilevel SAP explosion would require a separate enhancement that includes:

- Recursive component extraction
- Maximum depth configuration
- Cycle detection
- Duplicate material handling
- Repeated-component occurrence tracking
- SAP RFC request control
- Partial-failure handling
- Performance and concurrency controls

The current UI accurately represents the structure returned by the validated RFC instead of presenting a flat response as a false multilevel hierarchy.

## Notes

- SAP uses the asynchronous .NET job pipeline, similar to Teamcenter.
- SAP does not use a Next.js API route like Windchill and Configit.
- The Java extractor creates normalized JSON before the BOM is returned to the frontend.
- The browser does not read the local SAP JSON file directly.
- The JSON output matches the existing `.NET BomRoot` contract.
- `SourceBomPanel` remains source-independent and requires no SAP-specific rendering branch.
- `react-arborist` consumes the normalized `TreeNodeData`, not the native SAP table response.
- SAP extraction defaults are currently Plant `1001`, BOM Usage `3`, and Alternative `1`.
- Teamcenter, Windchill, and Configit extraction workflows remain separate and unchanged.
- The local HTTPS redirect warning does not block the HTTP development workflow when the API is running on `http://localhost:5212`.
- The validated SAP integration successfully rendered Material `PLM001007` with components `PLM001008` and `PLM001009`.
