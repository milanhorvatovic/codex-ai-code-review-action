---
applyTo: "**/*"
---

# Code Review Philosophy

## Approach

- Be constructive and opinionated — flag code smells, not just bugs
- Suggest better patterns, not just what is wrong
- Simpler is better — challenge unnecessary complexity
- Challenge abstractions that are not earning their keep
- Acknowledge good patterns when encountered

## Severity Levels

- **Critical**: security vulnerabilities, data loss, authentication bypass — blocks merge
- **High**: unhandled exceptions, performance regressions, logic errors
- **Medium**: code smells, missing error handling, suboptimal patterns
- **Low**: style inconsistencies, naming improvements, minor refactors

Only block merges on critical findings. Surface critical and high in the summary.

## Structured Findings

Each finding should include:
- **File and line** where the issue occurs
- **Severity** level (critical, high, medium, low)
- **Description** of the problem and why it matters
- **Suggestion** with a concrete fix or alternative

## What to Look For

- Security: injection, secrets exposure, unsafe input handling, missing validation
- Error handling: swallowed errors, missing catch blocks, unhandled rejections
- Performance: unnecessary allocations, redundant operations, N+1 patterns
- Architecture: tight coupling, single responsibility violations, missing boundaries
- Types: incorrect types, unsafe assertions, missing null checks
- Edge cases: empty inputs, boundary values, concurrent access
- Testing: new modules must include co-located test files (`*.test.ts`)
- Testability: external dependencies should use constructor injection
- Purity: business logic in `src/core/` must be pure — no side effects or direct I/O

## Noise Reduction

- Do not flag auto-generated code or migration files
- Do not flag style issues already covered by linters
- Focus on logic and architecture over formatting
- One finding per issue — do not repeat the same concern across files
