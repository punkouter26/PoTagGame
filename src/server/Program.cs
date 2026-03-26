using Microsoft.ApplicationInsights.Extensibility;
using Scalar.AspNetCore;
using Serilog;
using Serilog.Events;
using TagGame.Domain;
using TagGame.Features.Game;
using TagGame.Features.Lobby;
using TagGame.Features.Position;
using TagGame.Features.Replay;
using TagGame.Infrastructure.BackgroundServices;
using TagGame.Infrastructure.Hubs;

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

        var aiConnStr = ctx.Configuration["ApplicationInsights:ConnectionString"];
        if (!string.IsNullOrWhiteSpace(aiConnStr))
        {
            cfg.WriteTo.ApplicationInsights(
                new TelemetryConfiguration { ConnectionString = aiConnStr },
                TelemetryConverter.Traces,
                restrictedToMinimumLevel: LogEventLevel.Information);
        }
    });

    // ── Health checks ──────────────────────────────────────────────────────────
    builder.Services.AddHealthChecks();

    // ── OpenAPI (Scalar) ───────────────────────────────────────────────────────
    builder.Services.AddOpenApi();

    // ── Domain singleton ───────────────────────────────────────────────────────
    // Shared across all Hub instances and the background service.
    // SOLID: Dependency-Inversion — registered by interface; resolved by DI.
    builder.Services.AddSingleton<GameService>();

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

    app.UseSerilogRequestLogging();

    // Serve CSS/JS/image assets from wwwroot
    app.UseDefaultFiles();   // → index.html
    app.UseStaticFiles();

    // ── Health endpoint ────────────────────────────────────────────────────────
    app.MapHealthChecks("/health");

    // ── Diagnostics page ──────────────────────────────────────────────────────
    app.MapGet("/diag", (IConfiguration config, IWebHostEnvironment env) =>
    {
        // Mask all but the first 2 and last 2 characters of sensitive values
        static string Mask(string? value) =>
            string.IsNullOrEmpty(value) ? "(not set)"
            : value.Length <= 6        ? "****"
            : $"{value[..2]}{new string('*', value.Length - 4)}{value[^2..]}";

        return Results.Ok(new
        {
            app         = "PoTagGame",
            environment = env.EnvironmentName,
            server      = Environment.MachineName,
            utcNow      = DateTimeOffset.UtcNow,
            connections = new
            {
                signalR     = "ok (in-process)",
                appInsights = Mask(config["ApplicationInsights:ConnectionString"]),
            },
        });
    });

    // ── SignalR hub ────────────────────────────────────────────────────────────
    app.MapHub<TagHub>("/tagHub");

    // ── SPA fallback (React client-side routing) ───────────────────────────────
    app.MapFallbackToFile("index.html");

    Log.Information("PoTagGame server starting — ENV={Env}", app.Environment.EnvironmentName);

    // Warn if Application Insights is not configured outside Development
    if (string.IsNullOrWhiteSpace(builder.Configuration["ApplicationInsights:ConnectionString"])
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
