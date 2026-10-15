using Microsoft.AspNetCore.Mvc;
using Orchestration.API.Engineering.Services;

namespace Orchestration.API.Engineering.Controllers;

[ApiController]
[Route("api/engineering/jobs")]
public sealed class EngineeringJobsController : ControllerBase
{
    private readonly IEngineeringJobStore jobs;
    private readonly IEngineeringCancellationRegistry cancellations;

    public EngineeringJobsController(IEngineeringJobStore jobs, IEngineeringCancellationRegistry cancellations)
    {
        this.jobs = jobs;
        this.cancellations = cancellations;
    }

    [HttpGet("{jobId}")]
    public IActionResult Get(string jobId) => jobs.TryGet(jobId, out var job)
        ? Ok(job)
        : jobs.LookupStatus(jobId) == "expired"
            ? StatusCode(410, new { code = "job-expired", message = "Job has expired." })
            : NotFound(new { code = "job-not-found", message = "Job was not found." });

    [HttpGet("{jobId}/result")]
    public IActionResult GetResult(string jobId)
    {
        if (jobs.TryGetResult(jobId, out var result)) return Ok(result);
        if (jobs.LookupStatus(jobId) == "expired")
            return StatusCode(410, new { code = "job-expired", message = "Job has expired." });
        if (!jobs.TryGet(jobId, out var job) || job is null)
            return NotFound(new { code = "job-not-found", message = "Job was not found." });
        if (job.State is not (Contracts.JobState.Success or Contracts.JobState.PartialSuccess or Contracts.JobState.Empty or Contracts.JobState.Failed or Contracts.JobState.Unavailable or Contracts.JobState.Cancelled or Contracts.JobState.TimedOut))
            return StatusCode(409, new { code = "job-not-complete", message = "The job has not completed yet.", job.State, job.ProgressPercent });
        return NotFound(new { code = "job-result-not-available", message = "The completed job does not contain an extraction result." });
    }

    [HttpPost("{jobId}/cancel")]
    public IActionResult Cancel(string jobId)
    {
        var result = cancellations.Cancel(jobId);
        return result.Code switch
        {
            "job-not-found" => NotFound(result),
            "job-already-completed" or "job-already-cancelled" or "cancellation-unsupported" => Conflict(result),
            _ => result.Accepted ? Accepted(result) : StatusCode(500, result)
        };
    }
}
