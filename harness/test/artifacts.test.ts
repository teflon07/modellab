import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureVisualArtifacts, artifactRelPath } from "../src/artifacts";

test("captureVisualArtifacts copies site/ and score files, skips missing", () => {
  const src = mkdtempSync(join(tmpdir(), "art-src-"));
  const dest = join(src, "out");
  mkdirSync(join(src, "site"), { recursive: true });
  writeFileSync(join(src, "site", "index.html"), "<h1>Harbor</h1>");
  writeFileSync(join(src, "score.json"), "{\"score\":1}");
  const copied = captureVisualArtifacts(src, dest);
  expect(copied).toEqual(["site", "score.json"]);
  expect(readFileSync(join(dest, "site", "index.html"), "utf8")).toContain("Harbor");
  expect(existsSync(join(dest, "score.md"))).toBe(false);
});

test("artifactRelPath is stable and url-safe", () => {
  expect(artifactRelPath("harbor-pine-auth", "anthropic-claude-sonnet-5", 2))
    .toBe("artifacts/harbor-pine-auth/anthropic-claude-sonnet-5/2");
});
