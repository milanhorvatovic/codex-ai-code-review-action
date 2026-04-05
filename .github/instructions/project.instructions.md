---
applyTo: "**/*"
---

# Project Context

This is a TypeScript GitHub Action for AI-powered code review using OpenAI Codex.

## Architecture

- Two-job design with security isolation:
  - **Review job** (read-only): diff chunking, prompt assembly, structured findings
  - **Publish job** (write-access): inline PR comments, per-file summaries, verdict
- Two separate Node 22 JavaScript actions, each bundled independently by `esbuild`
- Default prompt and reference files embedded at build time via esbuild text loader

## Module Structure

```
src/
├── review/main.ts       # Review action entry point
├── publish/main.ts      # Publish action entry point
├── core/                # Pure business logic (diff processing, prompt assembly, merging)
├── github/              # GitHub API interaction (PR context, review posting)
├── openai/              # OpenAI API integration (structured output, retry)
├── config/              # Configuration (types, inputs, embedded defaults)
└── types/               # TypeScript declarations (.md text imports)
```

## Build and Validation

- Build: `npm run build`
- Type check: `npm run typecheck`
- Test: `npm test`
- Lint: `npm run lint`
- Coverage: `npm run test -- --coverage`

## Conventions

- Exact dependency versions in `package.json` (no caret or tilde ranges)
- `.yaml` extension for all YAML files
- Modular design: small, composable modules with clear boundaries
- Extract modules when it reduces complexity, not just to split files
- Keep coupling low and cohesion high
- Co-located tests (`*.test.ts` alongside source files)
- Pure functions in `src/core/` — no side effects or direct I/O
- Constructor injection for external dependencies (testability)

## Security Model

- Set minimal `permissions` in workflows (only what the job needs)
- Mask secrets with `core.setSecret()` before any logging
- Pass untrusted input via environment variables, never interpolate into shell commands
- Validate all external inputs at system boundaries
- Pin third-party actions to full commit SHA
