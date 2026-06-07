import { cp, rm, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { Fixture } from "./types";

export interface Sandbox {
  cwd: string;
}

export interface ProvisionOpts {
  repoRoot: string;
  fixture: Fixture;
  runId: string;
  specId: string;
  model: string;
  rep: number;
}

export async function provisionSandbox(opts: ProvisionOpts): Promise<Sandbox> {
  const slug = `${opts.specId}-${opts.model.replace(/[^a-zA-Z0-9]+/g, "-")}-${opts.rep}`;
  const base = join(opts.repoRoot, ".sandboxes", opts.runId);
  const cwd = join(base, slug);
  await mkdir(base, { recursive: true });
  await cp(resolve(opts.repoRoot, opts.fixture.repo), cwd, { recursive: true });

  for (const cmd of opts.fixture.setup) {
    const proc = Bun.spawn(["sh", "-c", cmd], { cwd, stdout: "pipe", stderr: "pipe" });
    const [code, errText] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);
    if (code !== 0) {
      throw new Error(`sandbox setup failed (${cmd}): exit ${code}\n${errText}`);
    }
  }
  return { cwd };
}

export async function teardownSandbox(sb: Sandbox): Promise<void> {
  await rm(sb.cwd, { recursive: true, force: true });
}
