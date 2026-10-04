import { readdirSync } from "node:fs";
import path from "node:path";
import { canonical, expand, inside, permitted } from "./policy.ts";

export const MANAGED_FILES = ["AGENTS.md", "settings.json", "sandbox-ceiling.json", "subagents.json"];
export const MANAGED_DIRS = ["agents", "skills", "extensions"];
export type MaintenanceConfig = { sourceDir: string; sourceAgentDir: string; executable: string; agentDir: string };

export function parseMaintenance(value: unknown, cwd: string, agentDir: string): MaintenanceConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Missing maintenance config");
  const record = value as Record<string, unknown>;
  if (typeof record.sourceDir !== "string" || typeof record.executable !== "string") throw new Error("Invalid maintenance config");
  const sourceDir = canonical(expand(record.sourceDir, cwd));
  const sourceAgentDir = canonical(path.join(sourceDir, "dot_pi", "agent"));
  const destination = canonical(agentDir);
  if (sourceDir === "/" || !inside(sourceDir, sourceAgentDir) || inside(sourceDir, destination) || inside(destination, sourceDir)) {
    throw new Error("Maintenance source and destination must be separate trees");
  }
  return { sourceDir, sourceAgentDir, executable: expand(record.executable, cwd), agentDir: destination };
}

export function applyTargets(raw: string[], config: MaintenanceConfig): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 32) throw new Error("Specify 1–32 individual managed targets");
  return [...new Set(raw.map(value => {
    if (typeof value !== "string" || value.startsWith("/") || value.includes("\\") || value.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error("Targets must be relative to the global Pi agent directory, without traversal");
    }
    if (!MANAGED_FILES.includes(value) && !MANAGED_DIRS.some(dir => value === dir || value.startsWith(dir + "/"))) {
      throw new Error("Not a managed Pi configuration target: " + value);
    }
    // Validate the lexical and resolved paths; a pre-existing symlink is not an escape hatch.
    return permitted(value, config.agentDir, [config.agentDir]);
  }))];
}

export function applyProtectedPaths(config: MaintenanceConfig): string[] {
  // A writable destination parent is needed for chezmoi's atomic rename. Overlay
  // unrelated existing entries read-only rather than expose credentials/state.
  return readdirSync(config.agentDir).filter(name => !MANAGED_FILES.includes(name) && !MANAGED_DIRS.includes(name))
    .map(name => canonical(path.join(config.agentDir, name)));
}
