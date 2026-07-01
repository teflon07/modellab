import { parse as parseYaml } from "yaml";
import { readFileSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { readdirSync } from "node:fs";
import { isTrack, type Spec, type Scoring } from "./types";

function parseScoring(raw: any, file: string): Scoring {
  if (!raw || typeof raw !== "object") throw new Error(`${file}: scoring is required`);
  if (raw.kind === "programmatic") return { kind: "programmatic" };
  if (raw.kind === "judge") {
    if (!raw.judge_model || !raw.rubric_file) {
      throw new Error(`${file}: judge scoring needs judge_model and rubric_file`);
    }
    return { kind: "judge", judge_model: String(raw.judge_model), rubric_file: String(raw.rubric_file) };
  }
  throw new Error(`${file}: scoring.kind must be 'programmatic' or 'judge'`);
}

export function parseSpec(text: string, file: string): Spec {
  const raw = parseYaml(text) ?? {};
  if (!raw.id) throw new Error(`${file}: id is required`);
  if (!isTrack(raw.track)) throw new Error(`${file}: invalid track '${raw.track}'`);
  if (raw.mode !== "single_shot" && raw.mode !== "agentic") {
    throw new Error(`${file}: mode must be 'single_shot' or 'agentic'`);
  }
  if (!Array.isArray(raw.models) || raw.models.length === 0) {
    throw new Error(`${file}: models must be a non-empty list`);
  }
  if (!Number.isInteger(raw.reps) || raw.reps < 1) throw new Error(`${file}: reps must be >= 1`);
  if (!Number.isFinite(raw.timeout_s) || raw.timeout_s <= 0) throw new Error(`${file}: timeout_s must be > 0`);
  if (!raw.prompt && !raw.prompt_file && !raw.fixture?.generator) {
    throw new Error(`${file}: prompt, prompt_file, or fixture.generator is required`);
  }

  const scoring = parseScoring(raw.scoring, file);

  let fixture: Spec["fixture"];
  if (raw.fixture) {
    fixture = {
      repo: String(raw.fixture.repo),
      setup: Array.isArray(raw.fixture.setup) ? raw.fixture.setup.map(String) : [],
      verify: Array.isArray(raw.fixture.verify) ? raw.fixture.verify.map(String) : [],
      generator: raw.fixture.generator ? String(raw.fixture.generator) : undefined,
    };
  }
  if (raw.mode === "agentic" && scoring.kind === "programmatic" && !fixture?.verify?.length) {
    throw new Error(`${file}: agentic + programmatic scoring requires fixture.verify`);
  }

  return {
    id: String(raw.id),
    track: raw.track,
    mode: raw.mode,
    prompt: raw.prompt ? String(raw.prompt) : undefined,
    prompt_file: raw.prompt_file ? String(raw.prompt_file) : undefined,
    models: raw.models.map(String),
    reps: raw.reps,
    timeout_s: raw.timeout_s,
    fixture,
    scoring,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
  };
}

export function loadSpec(path: string): Spec {
  return parseSpec(readFileSync(path, "utf8"), path);
}

export function loadSpecs(specsDir: string): Array<{ path: string; spec: Spec }> {
  const out: Array<{ path: string; spec: Spec }> = [];
  for (const track of ["frontier", "local", "crossover"]) {
    const dir = resolve(specsDir, track);
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      if (!name.endsWith(".yaml") && !name.endsWith(".yml")) continue;
      const path = resolve(dir, name);
      out.push({ path, spec: loadSpec(path) });
    }
  }
  return out;
}

export function resolvePrompt(spec: Spec, specPath: string): string {
  if (spec.prompt) return spec.prompt;
  if (spec.prompt_file) {
    return readFileSync(resolve(dirname(specPath), spec.prompt_file), "utf8");
  }
  throw new Error(`${basename(specPath)}: no prompt available`);
}
