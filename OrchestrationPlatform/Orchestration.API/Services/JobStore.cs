using System;
using System.Collections.Concurrent;
using System.Threading;

namespace Orchestration.API.Services
{
    public interface IJobStore
    {
        string CreateJob(string teamcenterItemId);
        bool JobExists(string jobId);
        void CompleteJob(string jobId);
        void FailJob(string jobId, string error);
        DateTime? GetJobCreatedTime(string jobId);
    }

    public class InMemoryJobStore : IJobStore
    {
        private readonly ConcurrentDictionary<string, (DateTime createdTime, string status)> _jobs;
        private readonly ILogger<InMemoryJobStore> _logger;

        public InMemoryJobStore(ILogger<InMemoryJobStore> logger)
        {
            _jobs = new ConcurrentDictionary<string, (DateTime, string)>();
            _logger = logger;
        }

        public string CreateJob(string teamcenterItemId)
        {
            var jobId = $"job_{teamcenterItemId}_{Guid.NewGuid().ToString().Substring(0, 8)}";
            var result = _jobs.TryAdd(jobId, (DateTime.UtcNow, "created"));
            if (result)
            {
                _logger.LogInformation($"Job created: {jobId}");
            }
            return jobId;
        }

        public bool JobExists(string jobId)
        {
            return _jobs.ContainsKey(jobId);
        }

        public void CompleteJob(string jobId)
        {
            if (_jobs.TryGetValue(jobId, out var job))
            {
                _jobs[jobId] = (job.createdTime, "completed");
                _logger.LogInformation($"Job completed: {jobId}");
            }
        }

        public void FailJob(string jobId, string error)
        {
            if (_jobs.TryGetValue(jobId, out var job))
            {
                _jobs[jobId] = (job.createdTime, $"failed: {error}");
                _logger.LogError($"Job failed: {jobId} - {error}");
            }
        }

        public DateTime? GetJobCreatedTime(string jobId)
        {
            if (_jobs.TryGetValue(jobId, out var job))
            {
                return job.createdTime;
            }
            return null;
        }
    }
}
