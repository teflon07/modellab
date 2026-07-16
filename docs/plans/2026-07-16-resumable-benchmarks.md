# Resumable Benchmarks Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover the reusable benchmark-runner work onto the public history with configurable Pi thinking and fail-closed, crash-safe resume behavior.

**Decision this serves:** Preserve the completed local campaign artifacts while publishing only reusable, privacy-safe harness behavior from a fresh `origin/main` branch.

**Budget:** Two implementation commits plus this plan commit. Stop if the work requires rerunning benchmarks, changing result scores, adding dependencies, or publishing local orchestration.

**Architecture:** The first slice adds one shared Pi thinking-level domain and threads it from configuration into Pi invocation. The second slice adds a focused checkpoint module that owns campaign identity, checkpoint loading, output preservation, heartbeat writes, and artifact checkpoints; the CLI remains the orchestration layer. Local launchd scripts, raw results, and machine paths stay outside Git.

**Tech Stack:** Bun 1.3, TypeScript, `bun:test`, Node standard-library filesystem and crypto APIs, YAML configuration.

---

### Task 1: Commit the recovery plan

**Files:**
- Create: `docs/plans/2026-07-16-resumable-benchmarks.md`

- [ ] **Step 1: Verify the plan has no private paths or placeholders**

Run:

```sh
grep -nE '/''Users/|T''BD|T''ODO|implement la''ter|fill i''n' docs/plans/2026-07-16-resumable-benchmarks.md
```

Expected: no output and exit 1.

- [ ] **Step 2: Commit**

```sh
git add docs/plans/2026-07-16-resumable-benchmarks.md
git commit -m "docs: plan resumable benchmark recovery"
```

### Task 2: Add configurable Pi thinking

**Files:**
- Modify: `harness/src/types.ts`
- Modify: `harness/src/config.ts`
- Modify: `harness/src/runner.ts`
- Modify: `harness/src/cli.ts`
- Modify: `config/modellab.yaml`
- Test: `harness/test/config.test.ts`
- Test: `harness/test/runner.test.ts`

- [ ] **Step 1: Write failing configuration and runner tests**

Add tests that require `parseConfig()` to accept `pi.thinking: high`, reject `extreme`, and require `buildPiArgs()` to emit `--thinking high` when configured while emitting no flag when omitted.

```ts
test("parseConfig reads and validates Pi thinking", () => {
  const cfg = parseConfig("obs:\n  db_path: /tmp/obs.db\npi:\n  thinking: high\n");
  expect(cfg.pi.thinking).toBe("high");
  expect(() => parseConfig("obs:\n  db_path: /tmp/obs.db\npi:\n  thinking: extreme\n")).toThrow(/pi\.thinking/);
});

test("Pi args carry the configured thinking level", () => {
  const args = buildPiArgs({
    spec: base,
    model: "openai/gpt-test",
    tag: "bench:r:s1:m:1",
    pool: "benchmark",
    promptText: "solve",
    thinking: "high",
  });
  expect(args.slice(args.indexOf("--thinking"), args.indexOf("--thinking") + 2)).toEqual(["--thinking", "high"]);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```sh
bun test harness/test/config.test.ts harness/test/runner.test.ts
```

Expected: failures because `Config.pi` and `BuildArgsOpts.thinking` do not exist.

- [ ] **Step 3: Implement the shared domain and propagation**

In `harness/src/types.ts`, define the accepted domain once:

```ts
export const PI_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
export type PiThinkingLevel = (typeof PI_THINKING_LEVELS)[number];

export function isPiThinkingLevel(value: string): value is PiThinkingLevel {
  return PI_THINKING_LEVELS.includes(value as PiThinkingLevel);
}
```

Use `PiThinkingLevel` in `Config.pi` and `BuildArgsOpts`, validate through `isPiThinkingLevel()`, pass `cfg.pi.thinking` to both primary Pi calls and Pi judge calls, and add `pi.thinking: high` to `config/modellab.yaml` without changing its public-facing runner description.

- [ ] **Step 4: Verify GREEN and run the full suite**

Run:

```sh
bun test harness/test/config.test.ts harness/test/runner.test.ts
bun test
bun build harness/src/cli.ts --target=bun --outfile /tmp/modellab-cli.js
```

Expected: all tests pass and the build exits 0.

- [ ] **Step 5: Commit**

```sh
git add config/modellab.yaml harness/src/types.ts harness/src/config.ts harness/src/runner.ts harness/src/cli.ts harness/test/config.test.ts harness/test/runner.test.ts
git commit -m "feat: configure Pi benchmark thinking"
```

### Task 3: Add fail-closed resumable checkpoints

**Files:**
- Create: `harness/src/checkpoint.ts`
- Create: `harness/test/checkpoint.test.ts`
- Modify: `harness/src/report.ts`
- Modify: `harness/src/cli.ts`
- Modify: `harness/test/cli.test.ts`

- [ ] **Step 1: Write failing checkpoint tests**

Create real filesystem tests using `mkdtempSync()` that require:

```ts
test("checkpoint load rejects a different campaign fingerprint", () => {
  const path = writeFixture({
    meta: { runId: "r", generatedAt: "2026-07-16T00:00:00.000Z", piVersion: "1", campaignFingerprint: "old" },
    summaries: [],
    runs: [],
  });
  expect(() => loadCheckpoint(path, "new")).toThrow(/campaign fingerprint mismatch/);
});

test("initializing outputs preserves existing raw output", () => {
  const path = join(dir, "outputs.jsonl");
  writeFileSync(path, "existing\n");
  initializeOutputs(path);
  expect(readFileSync(path, "utf8")).toBe("existing\n");
});

test("checkpoint write updates results and heartbeat together", () => {
  writeCheckpoint(outDir, [], [], meta);
  expect(JSON.parse(readFileSync(join(outDir, "results.json"), "utf8")).meta.campaignFingerprint).toBe(meta.campaignFingerprint);
  expect(JSON.parse(readFileSync(join(outDir, "heartbeat.json"), "utf8")).completed).toBe(0);
});
```

Also extend `harness/test/cli.test.ts` to import `RunResult` and test that completed tuples are skipped, missing tuples remain unfinished, timeouts with telemetry remain outcomes, and missing telemetry or quota/auth errors pause the campaign.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```sh
bun test harness/test/checkpoint.test.ts harness/test/cli.test.ts
```

Expected: failures because the checkpoint module and resume helpers do not exist.

- [ ] **Step 3: Implement minimal checkpoint ownership**

`harness/src/checkpoint.ts` must:

```ts
export function campaignFingerprint(identity: unknown): string;
export function loadCheckpoint(path: string, expectedFingerprint: string): { results: RunResult[]; generatedAt: string };
export function initializeOutputs(path: string): void;
export function writeCheckpoint(outDir: string, results: RunResult[], specs: Spec[], meta: ReportMeta): void;
```

`campaignFingerprint()` uses SHA-256 over deterministic JSON containing the runner, runner reasoning settings, Pi version, and the full selected spec/model/rep plan, never credentials or absolute paths. `loadCheckpoint()` rejects malformed metadata, missing fingerprints, mismatches, malformed run identities, and duplicate `(specId, model, rep)` tuples. `writeCheckpoint()` writes report, CSV, JSON, and heartbeat from the same result array.

In `harness/src/cli.ts`, compute the fingerprint before loading results; preserve the original `generatedAt` on resume; initialize outputs without truncation; checkpoint after every metered result; stop on retryable infrastructure failures; and exit nonzero when any scheduled tuple lacks a durable checkpoint.

- [ ] **Step 4: Verify GREEN and the complete contract**

Run:

```sh
bun test harness/test/checkpoint.test.ts harness/test/cli.test.ts
bun test
bun build harness/src/cli.ts --target=bun --outfile /tmp/modellab-cli.js
git diff --check origin/main...HEAD
```

Expected: all tests pass, build exits 0, and the diff check is clean.

- [ ] **Step 5: Commit**

```sh
git add harness/src/checkpoint.ts harness/test/checkpoint.test.ts harness/src/report.ts harness/src/cli.ts harness/test/cli.test.ts
git commit -m "feat: resume benchmark runs from durable checkpoints"
```

### Task 4: Verify privacy, scope, and branch readiness

**Files:**
- Verify only; no new files.

- [ ] **Step 1: Verify the branch contains only reusable code**

Run:

```sh
git diff --name-status origin/main...HEAD
grep -rInE '/''Users/|com\.stephenedwards|Dock Files' --exclude-dir=.git --exclude-dir=node_modules .
git status --short --branch
```

Expected: no machine-specific matches, only planned source/test/config/plan files differ, and the worktree is clean.

- [ ] **Step 2: Run final verification**

Run:

```sh
bun test
bun build harness/src/cli.ts --target=bun --outfile /tmp/modellab-cli.js
```

Expected: zero test failures and a successful build.

- [ ] **Step 3: Review the commits**

Run:

```sh
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

Expected: one plan commit and two implementation commits, with no local orchestration or result artifacts.
