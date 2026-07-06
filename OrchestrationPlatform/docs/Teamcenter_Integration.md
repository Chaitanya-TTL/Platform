# Teamcenter Integration and Pipeline Execution

## Summary

This document explains the recent fix that made `002380` run successfully from the frontend, through the backend API, into the Teamcenter extraction pipeline.

The root cause was the Windows batch invocation in `OrchestrationPlatform/Orchestration.API/Services/SubprocessExecutor.cs`. The backend was launching `run-pipeline.bat` incorrectly through `cmd.exe`, which caused a failure when the pipeline path contained spaces (`OneDrive`).

## What was changed

### Backend fix

File: `OrchestrationPlatform/Orchestration.API/Services/SubprocessExecutor.cs`

- The pipeline is invoked with:
  - `FileName = "cmd.exe"`
  - `Arguments = $"/c call \"{pipelinePath}\" \"{request.TeamcenterItemId}\""`
- This ensures Windows runs the `.bat` file correctly even when the file path contains spaces.
- `UseShellExecute` remains `false` so stdout/stderr can be captured.
- The code also logs the exact command being launched for debugging.

### Batch behavior

File: `TeamCenter-to-Configit-soa_client/backend/samples/run-pipeline.bat`

- Accepts Teamcenter item ID from `%~1`.
- Sets `TC_ITEM_ID` and runs `HelloTeamcenter`.
- Verifies `HelloTeamcenter\tc_extraction.json` is created.
- Copies that JSON into `ConfigitAceIntegration` and runs the transform.

### Controller flow

File: `OrchestrationPlatform/Orchestration.API/Controllers/PipelineController.cs`

- Receives the frontend request.
- Creates a job ID.
- Starts pipeline execution in background with `_ = Task.Run(...)`.
- Returns `success: true` immediately.

## How the pipeline execution works

1. Frontend sends a POST to `/api/pipeline/start` with `kind=Teamcenter` and `teamcenterItemId=002380`.
2. `PipelineController` receives the request and creates a job.
3. `PipelineOrchestrator` calls `SubprocessExecutor.ExecuteAsync(...)`.
4. `ExecuteTeamcenterAsync(...)` constructs the pipeline batch path and working directory.
5. It cleans stale outputs from previous runs.
6. It executes:
   ```csharp
   cmd.exe /c call "<pipelinePath>" "002380"
   ```
7. The batch runs `HelloTeamcenter`, creates `tc_extraction.json`, and then runs the transformation.
8. If the batch fails after extraction, the backend still attempts to read the generated `HelloTeamcenter\tc_extraction.json` and use that partial result.

## Why `call` is important

- `cmd.exe /c "path"` can fail with batch files when the path includes spaces.
- Adding `call` makes `cmd.exe` execute the batch file properly.
- Without `call`, `cmd.exe` may treat the path incorrectly and return a `not recognized as an internal or external command` error.

## Files involved

- `OrchestrationPlatform/Orchestration.API/Services/SubprocessExecutor.cs`
- `OrchestrationPlatform/Orchestration.API/Controllers/PipelineController.cs`
- `TeamCenter-to-Configit-soa_client/backend/samples/run-pipeline.bat`

## Results

After the fix, the frontend-triggered job created a fresh `HelloTeamcenter\tc_extraction.json` for `002380`.

The batch path was successfully invoked from the backend API, and the stale extraction file was no longer required.

## How to test

1. Delete any existing extraction JSON:

```powershell
Remove-Item 'TeamCenter-to-Configit-soa_client\backend\samples\HelloTeamcenter\tc_extraction.json' -Force
```

2. Start the backend:

```powershell
cd OrchestrationPlatform\Orchestration.API
dotnet run
```

3. Start the frontend:

```powershell
cd OrchestrationPlatform\frontend
npm run dev
```

4. Open `http://localhost:3000` and enter `002380`.

5. Confirm that the pipeline runs and `HelloTeamcenter\tc_extraction.json` is recreated.

## Notes

- The backend now supports partial output even when the Configit transform fails.
- The live extraction is prioritized over stale fallback data.
- This fix is specific to Windows path handling for `.bat` execution via `cmd.exe`.
