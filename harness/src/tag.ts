export function modelSlug(model: string): string {
  return model.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function buildRunTag(runId: string, specId: string, model: string, rep: number, attemptId?: string): string {
  const base = `bench:${runId}:${specId}:${modelSlug(model)}:${rep}`;
  return attemptId ? `${base}:${modelSlug(attemptId)}` : base;
}

export interface ParsedTag {
  runId: string;
  specId: string;
  modelSlug: string;
  rep: number;
  attemptId?: string;
}

export function parseRunTag(tag: string): ParsedTag | null {
  const parts = tag.split(":");
  if ((parts.length !== 5 && parts.length !== 6) || parts[0] !== "bench") return null;
  const rep = Number(parts[4]);
  if (!Number.isInteger(rep)) return null;
  return {
    runId: parts[1]!, specId: parts[2]!, modelSlug: parts[3]!, rep,
    ...(parts[5] ? { attemptId: parts[5] } : {}),
  };
}
