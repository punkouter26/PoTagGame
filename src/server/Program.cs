using System.Diagnostics;
using System.Security.Claims;
using System.Text.Json;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using Microsoft.ApplicationInsights.Extensibility;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Scalar.AspNetCore;
using Serilog;
using Serilog.Context;
using Serilog.Events;
using PoTagGame.Domain;
using PoTagGame.Features.Game;
using PoTagGame.Features.Lobby;
using PoTagGame.Features.Position;
using PoTagGame.Infrastructure.BackgroundServices;
using PoTagGame.Infrastructure.Hubs;

// ── Bootstrap logger (captures failures before host is built) ─────────────────
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // ── Serilog ────────────────────────────────────────────────────────────────
    builder.Host.UseSerilog((ctx, _, cfg) =>
    {
        cfg.ReadFrom.Configuration(ctx.Configuration)
           .Enrich.FromLogContext()
           .Enrich.WithProperty("Application", "PoTagGame")
           .Enrich.WithProperty("Environment", ctx.HostingEnvironment.EnvironmentName);

        var aiConnStr = ResolveAppInsightsConnectionString(ctx.Configuration);
        if (!string.IsNullOrWhiteSpace(aiConnStr))
        {
            cfg.WriteTo.ApplicationInsights(
                new TelemetryConfiguration { ConnectionString = aiConnStr },
                TelemetryConverter.Traces,
                restrictedToMinimumLevel: LogEventLevel.Information);
        }
    });

    // ── Health checks ──────────────────────────────────────────────────────────
    builder.Services.AddHttpClient("external-health", client =>
    {
        client.Timeout = TimeSpan.FromSeconds(5);
        client.DefaultRequestHeaders.UserAgent.ParseAdd("PoTagGame-HealthCheck/1.0");
    });

    builder.Services
        .AddHealthChecks()
        .AddCheck("signalr-in-process", () =>
            HealthCheckResult.Healthy("SignalR is hosted in-process."))
        .AddCheck("appinsights-config", () =>
        {
            var connectionString = ResolveAppInsightsConnectionString(builder.Configuration);
            return string.IsNullOrWhiteSpace(connectionString)
                ? HealthCheckResult.Degraded("Application Insights connection string is not configured.")
                : HealthCheckResult.Healthy("Application Insights connection string is configured.");
        })
        .AddCheck<ExternalHttpDependenciesHealthCheck>("external-http-dependencies");

    // ── OpenTelemetry ──────────────────────────────────────────────────────────
    var poSharedConnectionString = builder.Configuration["PoShared:ApplicationInsights:ConnectionString"];
    if (!string.IsNullOrWhiteSpace(poSharedConnectionString))
    {
        builder.Services.AddOpenTelemetry().UseAzureMonitor(options =>
        {
            options.ConnectionString = poSharedConnectionString;
        });
    }

    // ── OpenAPI (Scalar) ───────────────────────────────────────────────────────
    builder.Services.AddOpenApi();

    // ── Domain singleton ───────────────────────────────────────────────────────
    // Shared across all Hub instances and the background service.
    // SOLID: Dependency-Inversion — registered by interface; resolved by DI.
    builder.Services.AddSingleton<IGameService, GameService>();

    // ── VSA Feature Handlers — transient per Hub invocation ───────────────────
    builder.Services.AddTransient<JoinLobbyHandler>();
    builder.Services.AddTransient<StartGameHandler>();
    builder.Services.AddTransient<UpdatePositionHandler>();
    builder.Services.AddSingleton<ReplayRecorder>();

    // ── SignalR ────────────────────────────────────────────────────────────────
    builder.Services.AddSignalR(opts =>
    {
        opts.EnableDetailedErrors = builder.Environment.IsDevelopment();
    });

    // ── Background clock (1 Hz game timer) ────────────────────────────────────
    builder.Services.AddHostedService<GameBackgroundService>();

    var app = builder.Build();

    // ── Middleware pipeline ────────────────────────────────────────────────────
    if (app.Environment.IsDevelopment())
    {
        app.UseDeveloperExceptionPage();
        app.MapOpenApi();
        app.MapScalarApiReference();
    }

    app.Use(async (context, next) =>
    {
        var correlationId = context.Request.Headers["x-correlation-id"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(correlationId))
        {
            correlationId = Activity.Current?.TraceId.ToString() ?? context.TraceIdentifier;
        }

        context.Response.Headers["x-correlation-id"] = correlationId;

        var userId = context.User.Identity?.IsAuthenticated is true
            ? context.User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? context.User.Identity?.Name
                ?? "authenticated"
            : "anonymous";

        var sessionId = context.Request.Headers["x-session-id"].FirstOrDefault()
            ?? context.Request.Cookies[".AspNetCore.Session"]
            ?? context.TraceIdentifier;

        using (LogContext.PushProperty("CorrelationId", correlationId))
        using (LogContext.PushProperty("UserId", userId))
        using (LogContext.PushProperty("SessionId", sessionId))
        using (LogContext.PushProperty("Environment", app.Environment.EnvironmentName))
        {
            await next();
        }
    });

    app.UseSerilogRequestLogging(options =>
    {
        options.EnrichDiagnosticContext = (diagnosticContext, context) =>
        {
            diagnosticContext.Set("SessionId", context.Request.Headers["x-session-id"].FirstOrDefault() ?? context.Request.Cookies[".AspNetCore.Session"] ?? context.TraceIdentifier);
            diagnosticContext.Set("Environment", app.Environment.EnvironmentName);
            diagnosticContext.Set("CorrelationId", context.Response.Headers["x-correlation-id"].ToString());
        };
    });

    // Serve CSS/JS/image assets from wwwroot
    app.UseDefaultFiles();   // → index.html
    app.UseStaticFiles();

    // ── Health endpoint ────────────────────────────────────────────────────────
    app.MapHealthChecks("/health", new HealthCheckOptions
    {
        ResponseWriter = WriteHealthResponseAsync,
    });

    // ── Test-only: reset game state between E2E test runs ─────────────────────
    if (app.Environment.IsDevelopment())
    {
        app.MapGet("/test/reset", (IGameService game) =>
        {
            game.ResetToLobby();
            return Results.Ok(new { reset = true });
        });

        app.MapPost("/test/join", (JoinLobbyHandler joinLobby, string name) =>
        {
            var player = joinLobby.Handle($"http-debug-{Guid.NewGuid():N}", new JoinLobbyRequest(name));
            return player is null
                ? Results.BadRequest(new { message = "JoinLobby failed" })
                : Results.Ok(new { player.Id, player.Name, player.ColorIdx });
        });

        app.MapPost("/test/start", (StartGameHandler startGame, string? arenaId) =>
        {
            var started = startGame.Handle(string.IsNullOrWhiteSpace(arenaId) ? "grassland" : arenaId);
            return started is null
                ? Results.BadRequest(new { message = "StartGame failed" })
                : Results.Ok(started);
        });

        app.MapPost("/test/position", (UpdatePositionHandler updatePosition, float x, float y, string state, string direction) =>
        {
            var (accepted, roundEnded) = updatePosition.Handle(
                "http-debug-position",
                new UpdatePositionRequest(x, y, state, direction));

            return Results.Ok(new
            {
                accepted,
                roundEnded = roundEnded is not null,
            });
        });
    }

    // ── Diagnostics page ──────────────────────────────────────────────────────
    app.MapGet("/diag", async (IConfiguration config, IWebHostEnvironment env, HealthCheckService healthChecks, HttpContext context, CancellationToken cancellationToken) =>
    {
        // Mask all but the first 2 and last 2 characters of sensitive values
        static string Mask(string? value) =>
            string.IsNullOrEmpty(value) ? "(not set)"
            : value.Length <= 6        ? "****"
            : $"{value[..2]}{new string('*', value.Length - 4)}{value[^2..]}";

        var report = await healthChecks.CheckHealthAsync(cancellationToken);
        var dependencies = report.Entries.Select(entry => new
        {
            name = entry.Key,
            status = entry.Value.Status.ToString(),
            description = entry.Value.Description,
            durationMs = entry.Value.Duration.TotalMilliseconds,
        }).ToArray();

        var corr = context.Response.Headers["x-correlation-id"].ToString();
        if (string.IsNullOrWhiteSpace(corr))
        {
            corr = context.TraceIdentifier;
        }

        return Results.Ok(new
        {
            app         = "PoTagGame",
            environment = env.EnvironmentName,
            server      = Environment.MachineName,
            utcNow      = DateTimeOffset.UtcNow,
            correlationId = corr,
            health = report.Status.ToString(),
            connections = new
            {
                signalR     = "ok (in-process)",
                appInsights = Mask(ResolveAppInsightsConnectionString(config)),
            },
            dependencies,
        });
    });

    // ── SignalR hub ────────────────────────────────────────────────────────────
    app.MapHub<TagHub>("/tagHub");

    // ── SPA fallback (React client-side routing) ───────────────────────────────
    app.MapFallbackToFile("index.html");

    Log.Information("PoTagGame server starting — ENV={Env}", app.Environment.EnvironmentName);

    // Warn if Application Insights is not configured outside Development
    if (string.IsNullOrWhiteSpace(ResolveAppInsightsConnectionString(builder.Configuration))
        && !app.Environment.IsDevelopment())
    {
        Log.Warning("Application Insights connection string is not set — telemetry will not be sent");
    }

    app.Run();
    return 0;
}
catch (Exception ex) when (ex is not HostAbortedException)
{
    Log.Fatal(ex, "PoTagGame terminated unexpectedly");
    return 1;
}
finally
{
    Log.CloseAndFlush();
}

static string? ResolveAppInsightsConnectionString(IConfiguration configuration)
{
    return configuration["PoShared:ApplicationInsights:ConnectionString"]
        ?? configuration["ApplicationInsights:ConnectionString"];
}

static async Task WriteHealthResponseAsync(HttpContext context, HealthReport report)
{
    context.Response.ContentType = "application/json";

    var payload = new
    {
        status = report.Status.ToString(),
        totalDurationMs = report.TotalDuration.TotalMilliseconds,
        timestampUtc = DateTimeOffset.UtcNow,
        dependencies = report.Entries.Select(entry => new
        {
            name = entry.Key,
            status = entry.Value.Status.ToString(),
            description = entry.Value.Description,
            durationMs = entry.Value.Duration.TotalMilliseconds,
            data = entry.Value.Data.ToDictionary(kvp => kvp.Key, kvp => kvp.Value?.ToString()),
        }),
    };

    await context.Response.WriteAsync(JsonSerializer.Serialize(payload));
}

sealed class ExternalHttpDependenciesHealthCheck(
    IConfiguration configuration,
    IHttpClientFactory httpClientFactory,
    ILogger<ExternalHttpDependenciesHealthCheck> logger) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var urls = configuration.GetSection("ExternalDependencies:Urls").Get<string[]>() ?? Array.Empty<string>();
        if (urls.Length == 0)
        {
            return HealthCheckResult.Healthy("No external HTTP dependencies configured.");
        }

        var client = httpClientFactory.CreateClient("external-health");
        var failures = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var url in urls.Where(url => !string.IsNullOrWhiteSpace(url)))
        {
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                using var response = await client.SendAsync(request, cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    failures[url] = $"HTTP {(int)response.StatusCode}";
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "External dependency health probe failed for {Url}", url);
                failures[url] = ex.Message;
            }
        }

        return failures.Count == 0
            ? HealthCheckResult.Healthy("All external HTTP dependencies responded successfully.")
            : HealthCheckResult.Unhealthy(
                description: "One or more external HTTP dependencies failed health probing.",
                data: failures.ToDictionary(kvp => kvp.Key, kvp => (object)kvp.Value));
    }
}
