---
applyTo: "**/*.ts"
---

# TypeScript Standards

## Type Safety

- Strict TypeScript — no `any`, no type assertions unless unavoidable with justification
- Use `unknown` over `any` when the type is truly unknown
- Prefer type inference where obvious, explicit annotations at function boundaries
- Define interfaces for API responses, never pass raw untyped data

```typescript
// Preferred
function processFindings(findings: readonly Finding[]): Summary {

// Avoided
function processFindings(findings: any): any {
```

## Error Handling

- Top-level: catch with `core.setFailed()` for clean Action failure reporting
- Use typed error checking with `instanceof Error`
- No swallowed errors, no empty catch blocks
- Validate inputs at system boundaries, trust internal code

```typescript
// Preferred
async function run(): Promise<void> {
  try {
    const token = core.getInput("github-token", { required: true });
    core.setSecret(token);
    // ...
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

// Avoided
async function run(): Promise<void> {
  const token = core.getInput("github-token");
  // unhandled rejection if anything throws
}
```

## Async Patterns

- Always `await` promises — never fire-and-forget
- Use `async`/`await` over raw `.then()` chains
- Implement exponential backoff with jitter for external API calls

## Code Quality

- Pure functions over side effects
- Small, focused functions with single responsibility
- Prefer `const` over `let`, never `var`
- No magic numbers or strings — use named constants
- Meaningful names — no abbreviations, no single-letter variables outside loops
- No dead code, no commented-out code, no TODOs without linked issues

## Modularity

- Small, composable modules with clear boundaries
- Separate concerns: I/O, business logic, and data transformation
- Constructor injection for dependencies — no DI containers

```typescript
// Preferred — injectable, testable
class ReviewEngine {
  constructor(
    private readonly aiClient: AIClient,
    private readonly diffProcessor: DiffProcessor,
  ) {}
}

// Avoided — hard-coded, untestable
class ReviewEngine {
  private readonly aiClient = new OpenAIClient(process.env.API_KEY!);
}
```

- Keep modules focused — if a module does too many things, split it
