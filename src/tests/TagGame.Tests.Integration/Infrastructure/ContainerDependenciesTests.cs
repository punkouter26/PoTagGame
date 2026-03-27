using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using FluentAssertions;
using Xunit;

namespace PoTagGame.Tests.Integration.Infrastructure;

/// <summary>
/// Validates that local integration dependencies can be provisioned using Testcontainers.
/// This acts as a guardrail for Azurite/SQL containerized test setup expectations.
/// </summary>
public sealed class ContainerDependenciesTests
{
    [Fact]
    public async Task AzuriteAndSqlContainers_CanStartAndExposePorts()
    {
        if (!string.Equals(Environment.GetEnvironmentVariable("RUN_CONTAINER_TESTS"), "true", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        await using var azurite = new TestcontainersBuilder<TestcontainersContainer>()
            .WithImage("mcr.microsoft.com/azure-storage/azurite:latest")
            .WithCommand("azurite --blobHost 0.0.0.0 --queueHost 0.0.0.0 --tableHost 0.0.0.0")
            .WithPortBinding(10000, true)
            .WithWaitStrategy(Wait.ForUnixContainer().UntilPortIsAvailable(10000))
            .Build();

        await using var sql = new TestcontainersBuilder<TestcontainersContainer>()
            .WithImage("mcr.microsoft.com/mssql/server:2022-latest")
            .WithEnvironment("ACCEPT_EULA", "Y")
            .WithEnvironment("MSSQL_SA_PASSWORD", "PoTagGame_Integration_1!")
            .WithPortBinding(1433, true)
            .WithWaitStrategy(Wait.ForUnixContainer().UntilPortIsAvailable(1433))
            .Build();

        try
        {
            await azurite.StartAsync();
            await sql.StartAsync();

            azurite.GetMappedPublicPort(10000).Should().BeGreaterThan(0);
            sql.GetMappedPublicPort(1433).Should().BeGreaterThan(0);
        }
        finally
        {
            await azurite.DisposeAsync();
            await sql.DisposeAsync();
        }
    }
}
