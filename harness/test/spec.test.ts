import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseSpec, resolvePrompt, loadSpecs } from "../src/spec";

test("parseSpec accepts a valid single-shot spec", () => {
  const spec = parseSpec(`
id: extract-json
track: local
mode: single_shot
prompt: "Extract the name."
models: [ "ollama/llama3" ]
reps: 1
timeout_s: 60
scoring: { kind: programmatic }
tags: [ extraction ]
`, "extract-json.yaml");
  expect(spec.id).toBe("extract-json");
  expect(spec.track).toBe("local");
  expect(spec.scoring.kind).toBe("programmatic");
});

test("parseSpec rejects bad track and missing prompt", () => {
  expect(() => parseSpec(`id: x\ntrack: bogus\nmode: single_shot\nmodels: [a]\nreps: 1\ntimeout_s: 1\nscoring: {kind: programmatic}\ntags: []`, "x.yaml")).toThrow(/track/);
  expect(() => parseSpec(`id: x\ntrack: local\nmode: single_shot\nmodels: [a]\nreps: 1\ntimeout_s: 1\nscoring: {kind: programmatic}\ntags: []`, "x.yaml")).toThrow(/prompt/);
});

test("parseSpec requires fixture for agentic + programmatic scoring", () => {
  expect(() => parseSpec(`id: x\ntrack: frontier\nmode: agentic\nprompt: do it\nmodels: [a]\nreps: 1\ntimeout_s: 1\nscoring: {kind: programmatic}\ntags: []`, "x.yaml")).toThrow(/fixture/);
});

test("visual ladder specs parse and keep the visual tag", () => {
  const loaded = loadSpecs(resolve(import.meta.dir, "../../specs"));
  const visual = loaded.filter((s) => s.spec.tags.includes("website"));
  const ids = visual.map((s) => s.spec.id).sort();
  expect(ids).toEqual([
    "atlas-auth", "atlas-interactive", "atlas-static",
    "harbor-pine-auth", "harbor-pine-interactive", "harbor-pine-static",
    "northline-auth", "northline-interactive", "northline-static",
  ]);
  for (const { spec } of visual) {
    expect(spec.mode).toBe("agentic");
    expect(spec.scoring.kind).toBe("programmatic");
    expect(spec.fixture?.verify.length).toBeGreaterThan(0);
  }
});

test("resolvePrompt reads prompt_file relative to spec dir", () => {
  const dir = mkdtempSync(join(tmpdir(), "spec-"));
  writeFileSync(join(dir, "p.md"), "PROMPT BODY");
  const spec = parseSpec(`id: x\ntrack: local\nmode: single_shot\nprompt_file: p.md\nmodels: [a]\nreps: 1\ntimeout_s: 1\nscoring: {kind: programmatic}\ntags: []`, join(dir, "x.yaml"));
  expect(resolvePrompt(spec, join(dir, "x.yaml"))).toBe("PROMPT BODY");
});
