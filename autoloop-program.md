# Autoloop Program Definition

This file defines the goal, target, and evaluation metric for the Autoloop agent. Modify this file whenever you want to set a new optimization task.

## Target
`src/server/Domain/TagChecker.cs`

## Goal
Improve the `TagChecker` domain logic. Your objectives are:
1. Add standard C# XML documentation comments strictly to all public methods, properties, and classes.
2. Ensure the code is clean, readable, and properly formatted.
3. Replace any magic numbers or hardcoded strings with well-named `const` or `readonly` fields.

## Metric
To consider a change an improvement, it MUST pass the following criteria:
1. **Compilation**: The server project must strictly compile without warnings or errors. 
   - Evaluation script: `dotnet build src/server/PoTagGame.csproj`
2. **Quality Checklist**:
   - Are there XML comments on all public members?
   - Has readability improved?

## Instructions for Agent
- Only modify the target file.
- Do not introduce breaking API changes.
- After proposing a change, run the build command to ensure the application still compiles.
