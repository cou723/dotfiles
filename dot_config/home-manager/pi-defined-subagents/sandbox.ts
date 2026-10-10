// Local Linux-only boundary for the pinned agwab headless runner.
// Parent-side artifacts are deliberately NOT writable by the child.
import { readFileSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { SandboxInput } from "../core/constants.ts";

const config = JSON.parse(readFileSync(new URL("./runtime-config.json", import.meta.url), "utf8"));

export class SandboxUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxUnavailableError";
  }
}

export async function withSandboxedArgv<T>(
  argv: readonly [string, ...string[]],
  options: { sandbox: SandboxInput; cwd: string; writablePaths?: readonly string[]; signal?: AbortSignal },
  run: (launch: { argv: readonly [string, ...string[]]; env: NodeJS.ProcessEnv }) => Promise<T>,
): Promise<T> {
  if (process.platform !== "linux") throw new SandboxUnavailableError("Linux bubblewrap is required; no unsandboxed fallback.");
  if (options.signal?.aborted) throw options.signal.reason ?? new Error("Aborted");
  const sandbox = options.sandbox;
  if (sandbox === true || !Array.isArray(sandbox.allowedDomains) ||
      sandbox.allowedDomains.length !== 1 || sandbox.allowedDomains[0] !== "*") {
    throw new SandboxUnavailableError("This minimal backend only implements the trusted unrestricted-network policy.");
  }
  const cwd = resolve(options.cwd);
  if (await realpath(cwd) !== cwd || !(await stat(cwd)).isDirectory()) {
    throw new SandboxUnavailableError("Workspace must be a canonical directory.");
  }
  // Read-only host filesystem; one writable per-job workspace, isolated /dev and /proc.
  // No anonymous /tmp write grant: TMPDIR and HOME are inside the workspace.
  // Disable nested user namespaces and drop capabilities. Network is intentionally shared.
  const wrapped = [
    config.bwrap, "--unshare-user", "--disable-userns", "--unshare-pid",
    "--unshare-ipc", "--unshare-uts", "--ro-bind", "/", "/",
    "--bind", cwd, cwd, "--dev", "/dev", "--proc", "/proc",
    "--cap-drop", "ALL", "--new-session", "--die-with-parent", "--chdir", cwd,
    "--", ...argv,
  ] as [string, ...string[]];
  return await run({ argv: wrapped, env: {} });
}
