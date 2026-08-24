import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ARTIFACT_NAMES = ["site", "score.json", "score.md"];

/**
 * Copy the visual deliverable out of a sandbox before teardown so viewers can
 * open the built site next to its rubric. Missing paths are skipped.
 */
export function captureVisualArtifacts(sandboxCwd: string, destDir: string): string[] {
  mkdirSync(destDir, { recursive: true });
  const copied: string[] = [];
  for (const name of ARTIFACT_NAMES) {
    const src = join(sandboxCwd, name);
    if (!existsSync(src)) continue;
    cpSync(src, join(destDir, name), { recursive: true });
    copied.push(name);
  }
  return copied;
}

export function artifactRelPath(specId: string, modelSlug: string, rep: number): string {
  return `artifacts/${specId}/${modelSlug}/${rep}`;
}
