## Test Guide - Orchestration Platform

### Prerequisites
- Both backend (`dotnet run`) and frontend (`npm run dev`) are running
- Frontend accessible at http://localhost:3000
- Backend API accessible at http://localhost:5212/api

### Test Flow

#### 1. **Verify Backend Health**
```bash
Invoke-WebRequest -Uri "http://localhost:5212/api/pipeline/health"
# Should return: {"status":"healthy","timestamp":"..."}
```

#### 2. **Load Dashboard**
- Open http://localhost:3000 in browser
- Should see:
  - "Orchestration Platform" title
  - "BOM Flow: TeamCenter → Configit → SAP" subtitle
  - Left panel: "Start Pipeline" form with TC Item ID input
  - Right panel: Empty (will populate when pipeline runs)

#### 3. **Start Pipeline Test**

**Option A: Using Sample TC Item ID**
- Enter: `000575` (included in sample data)
- Click "Start Pipeline"
- Should see:
  - Form disabled/loading state
  - Right panel shows progress tracker
  - "Pipeline Progress" bar starting at 0%
  - Animated spinner on "Extract" phase

**Option B: Using Your Own TC Item ID**
- Enter your valid TeamCenter item ID
- Follow same flow as Option A

#### 4. **Monitor Real-Time Progress**

As pipeline executes, frontend should show:

**Phase 1: Extract (0-20%)**
- Message: "Connecting to TeamCenter..."
- Status: In Progress (spinner)
- Progress: Increases towards 20%

**Phase 2: Transform (20-80%)**
- Message: "Executing ETL pipeline..."
- Status: In Progress (spinner)
- Progress: Increases from 20% to 80%
- Activity log fills with batch output lines

**Phase 3: Load (80-100%)**
- Message: "Finalizing..."
- Status: In Progress (spinner)
- Progress: Increases from 80% to 100%

**Completion (100%)**
- All phases show ✓ (green checkmark)
- Message: "✓ Pipeline completed successfully!"
- Green banner: "✓ Pipeline completed successfully!"
- BOM Structure section appears below

#### 5. **Verify BOM Visualization**

When pipeline completes:
- "BOM Structure" card appears below progress tracker
- Shows expandable tree with:
  - Root item ID (the TC item you entered)
  - Sub-components with quantities
  - Nested children expandable/collapsible

Example tree for 000575:
```
000575 (root)
├─ 000577 (Seq 10) - Body (View)
│  ├─ 000578 (Seq 10) - Top [Qty]
│  ├─ 000579 (Seq 20) - Barrel [Qty]
│  └─ 000582 (Seq 30) - Grip [Qty]
└─ 001908 (Seq 20)
   └─ ... more items
```

#### 6. **Check Audit Logs**

After pipeline completes, verify logs were created:

```bash
# List all logs
Get-ChildItem "OrchestrationPlatform\Orchestration.API\Logs\"

# Should see: audit_job_*.json files

# View via API
Invoke-WebRequest -Uri "http://localhost:5212/api/pipeline/logs" -UseBasicParsing | ConvertFrom-Json
```

Audit log should contain:
- jobId: `job_<TCID>_<random>`
- teamcenterItemId: The TC item you entered
- startTime: ISO timestamp
- endTime: ISO timestamp
- status: "success" or "failed"
- phases: Array of Extract, Transform, Load with timings
- finalBom: The parsed BOM structure

#### 7. **Test Error Handling**

**Empty Item ID:**
- Don't enter anything, click "Start Pipeline"
- Should show error: "TeamCenter Item ID is required"
- Form remains enabled

**Invalid Item ID:**
- Enter non-existent TC item (e.g., "999999")
- Click "Start Pipeline"
- Pipeline starts but may fail at extract phase
- Should show error message in dashboard
- Check logs for failure details

**Backend Down:**
- Kill backend (`Ctrl+C` in backend terminal)
- Try to start pipeline
- Should show connection error in frontend
- Restart backend to recover

#### 8. **Test Real-Time SSE**

Open browser DevTools (F12):
- Go to Network tab
- Filter by "XHR" or "EventStream"
- Click "Start Pipeline"
- Should see:
  - POST to `/api/pipeline/start` (returns jobId)
  - GET to `/api/pipeline/progress/{jobId}` (SSE stream)
  - Multiple `data:` messages flowing in
  - Each message is JSON with phase/progress/message

#### 9. **Test Multiple Runs**

After first pipeline completes:
- Enter a different TC item ID (or same one)
- Click "Start Pipeline" again
- Should show new progress tracker
- Previous BOM remains visible until new one completes
- Check audit logs - should have new file created

#### 10. **Performance Indicators**

Monitor while pipeline runs:

**Frontend (http://localhost:3000):**
- CPU: Low (mostly idle, waiting for SSE updates)
- Memory: Stable ~40-50MB
- Network: One SSE stream, minimal bandwidth

**Backend (http://localhost:5212):**
- CPU: Peaks when executing subprocess
- Memory: Stable ~100MB
- Logs: Should show detailed phase progress

#### Expected Outcomes

**Successful Pipeline Run:**
```
✓ Form accepts input
✓ Backend receives request
✓ Job created with ID
✓ Progress streams to frontend
✓ All 3 phases complete
✓ BOM loads and renders
✓ Audit log created
✓ Completion banner shown
Total time: 30-60 seconds (depends on batch file execution)
```

**Failed Run:**
```
✓ Error message displayed
✓ Red error banner shown
✓ Partial audit log created with failure details
✓ User can retry with different input
```

### Browser Console

Check for errors in browser console (F12 → Console):
- Should see no errors
- May see warnings about unused variables
- Network requests should all return 2xx status codes

### Log Files Location

Backend logs are stored at:
```
OrchestrationPlatform/Orchestration.API/Logs/audit_*.json
```

Each file contains complete pipeline execution details for that run.

### Cleanup Between Tests

**Clear logs:**
```bash
Remove-Item "OrchestrationPlatform\Orchestration.API\Logs\*"
```

**Restart services:**
```bash
# Terminal 1
Ctrl+C (stop backend)
dotnet run

# Terminal 2
Ctrl+C (stop frontend)
npm run dev
```

### Known Limitations (POC)

1. Only TC→Configit pipeline is integrated (no SAP yet)
2. Pipeline timeout is 5 minutes
3. BOM data only available after pipeline completes
4. No authentication/authorization
5. In-memory job store (resets on backend restart)
6. File-based logs (not database)

### Success Criteria

- ✓ Dashboard loads without errors
- ✓ Form accepts TC item ID input
- ✓ "Start Pipeline" button triggers backend
- ✓ Progress tracker updates in real-time
- ✓ All 3 phases complete successfully
- ✓ BOM structure displays correctly
- ✓ Audit log file created
- ✓ No unhandled errors in console

If all above pass, the orchestration platform is working correctly!
