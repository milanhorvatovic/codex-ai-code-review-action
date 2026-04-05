---
applyTo: "**/*"
---

# Project Context

This is a TypeScript GitHub Action for AI-powered code review using OpenAI Codex.

## Architecture

- Two-job design with security isolation:
  - **Review job** (read-only): diff chunking, prompt assembly, structured findings
  - **Publish job** (write-access): inline PR comments, per-file summaries, verdict
- Bundled with `esbuild` into a single `dist/main.js`
- Runs on Node 22 (`node22` GitHub Actions runtime)

## Module Structure

```
src/
├── core/          # Pure business logic (review engine, diff processing)
├── github/        # GitHub API interaction (read context, post comments)
├── openai/        # OpenAI API integration (prompts, retry, rate limiting)
├── config/        # Configuration constants and defaults
└── main.ts        # Entry point and orchestration
```

## Build and Validation

- Build: `npm run build`
- Type check: `npm run typecheck`
- Test: `npm test`

## Conventions

- Exact dependency versions in `package.json` (no caret or tilde ranges)
- `.yaml` extension for all YAML files
- Modular design: small, composable modules with clear boundaries
- Extract modules when it reduces complexity, not just to split files
- Keep coupling low and cohesion high

## Security Model

- Set minimal `permissions` in workflows (only what the job needs)
- Mask secrets with `core.setSecret()` before any logging
- Pass untrusted input via environment variables, never interpolate into shell commands
- Validate all external inputs at system boundaries
- Pin third-party actions to full commit SHA
