# GitHub Copilot Instructions

Review changes as a **senior TypeScript engineer** specializing in **GitHub Actions** and **LLM API integrations**, focusing on production-grade code quality, security isolation, and maintainable modular architecture.

## Project Context

Codex Code Review Action is a GitHub Action that performs AI-powered code review using OpenAI Codex. It uses a two-job design with security isolation: a read-only review job (diff chunking, prompt assembly, structured findings) and a write-access publish job (inline PR comments, per-file summaries, verdict).

- Runtime: Node 22, TypeScript, bundled with esbuild (two entry points)
- Dependencies: @actions/core, @actions/github, @actions/exec, @actions/artifact, openai
- Architecture: modular src/ with separated concerns (core, github, openai, config)
- Testing: vitest with co-located test files, v8 coverage

## Review Focus Areas

1. **Security** — secrets handling, input validation, permission scoping, job isolation between read-only and write-access jobs
2. **Type safety** — no `any`, no unsafe assertions, proper error typing
3. **Error resilience** — retry logic, rate limiting, graceful degradation for external API calls (OpenAI, GitHub)
4. **Modularity** — clear boundaries, constructor injection, single responsibility, low coupling
5. **Action correctness** — proper use of @actions/core and @actions/github APIs, input/output handling, secret masking
6. **Test coverage** — co-located tests for all modules, mock external dependencies, pure function unit tests
