export function modelSlug(model: string): string {
  return model.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function buildRunTag(runId: string, specId: string, model: string, rep: number): string {
  return `bench:${runId}:${specId}:${modelSlug(model)}:${rep}`;
}

export interface ParsedTag {
  runId: string;
  specId: string;
  modelSlug: string;
  rep: number;
}

export function parseRunTag(tag: string): ParsedTag | null {
  const parts = tag.split(":");
  if (parts.length !== 5 || parts[0] !== "bench") return null;
  const rep = Number(parts[4]);
  if (!Number.isInteger(rep)) return null;
  return { runId: parts[1]!, specId: parts[2]!, modelSlug: parts[3]!, rep };
}
