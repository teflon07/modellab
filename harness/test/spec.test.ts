import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSpec, resolvePrompt } from "../src/spec";

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

test("resolvePrompt reads prompt_file relative to spec dir", () => {
  const dir = mkdtempSync(join(tmpdir(), "spec-"));
  writeFileSync(join(dir, "p.md"), "PROMPT BODY");
  const spec = parseSpec(`id: x\ntrack: local\nmode: single_shot\nprompt_file: p.md\nmodels: [a]\nreps: 1\ntimeout_s: 1\nscoring: {kind: programmatic}\ntags: []`, join(dir, "x.yaml"));
  expect(resolvePrompt(spec, join(dir, "x.yaml"))).toBe("PROMPT BODY");
});
