import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { provisionSandbox, teardownSandbox } from "../src/sandbox";

test("provisionSandbox copies the fixture and runs setup; teardown removes it", async () => {
  const root = mkdtempSync(join(tmpdir(), "lab-"));
  const fixtureDir = join(root, "fixtures", "demo");
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(join(fixtureDir, "data.txt"), "original");

  const sb = await provisionSandbox({
    repoRoot: root,
    fixture: { repo: "fixtures/demo", setup: ["echo ready > setup-marker.txt"], verify: [] },
    runId: "r1", specId: "s1", model: "m1", rep: 1,
  });

  expect(existsSync(join(sb.cwd, "data.txt"))).toBe(true);
  expect(readFileSync(join(sb.cwd, "data.txt"), "utf8")).toBe("original");
  expect(existsSync(join(sb.cwd, "setup-marker.txt"))).toBe(true);

  await teardownSandbox(sb);
  expect(existsSync(sb.cwd)).toBe(false);
});
