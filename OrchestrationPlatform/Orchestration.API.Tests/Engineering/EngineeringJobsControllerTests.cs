using Microsoft.AspNetCore.Mvc;
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Engineering.Controllers;
using Orchestration.API.Engineering.Services;
using Xunit;

namespace Orchestration.API.Tests.Engineering;

public sealed class EngineeringJobsControllerTests
{
    [Fact]
    public void UnknownJobReturnsNotFound()
    {
        var store = new EngineeringJobStore();
        using var cancellation = new EngineeringCancellationRegistry(store);
        var controller = new EngineeringJobsController(store, cancellation);
        Assert.IsType<NotFoundObjectResult>(controller.Get("missing"));
    }

    [Fact]
    public void ActiveJobCancellationReturnsAccepted()
    {
        var store = new EngineeringJobStore();
        using var cancellation = new EngineeringCancellationRegistry(store);
        var job = store.Create("request", "correlation", EngineeringSource.Teamcenter, TimeSpan.FromMinutes(1));
        cancellation.Register(job.JobId, CancellationToken.None, TimeSpan.FromMinutes(1));
        var controller = new EngineeringJobsController(store, cancellation);
        Assert.IsType<AcceptedResult>(controller.Cancel(job.JobId));
    }
}
