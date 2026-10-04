import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { canonical, compose, parseScope, type Scope } from "./policy.ts";
import { parseAllowedAgents } from "./delegation.ts";

export type AgentPolicy = { scope: Scope; configApply: boolean; allowedAgents: string[] };
type Definition = Record<string, unknown> | Error;
export type Definitions = Map<string, Definition>;

export function snapshotDefinitions(directory: string, parse: (text: string) => Record<string, unknown>): Definitions {
  const definitions: Definitions = new Map();
  if (!existsSync(directory)) return definitions;
  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith(".md")) continue;
    const name = entry.slice(0, -3);
    try {
      const definition = parse(readFileSync(path.join(directory, entry), "utf8"));
      if (definition.name !== undefined && definition.name !== name) throw new Error("Agent filename/name mismatch");
      definitions.set(name, definition);
    } catch (error) { definitions.set(name, new Error(String(error))); }
  }
  return definitions;
}

export function resolvePolicy(name: string, cwd: string, global: Definitions, project: Definitions): AgentPolicy {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(name)) throw new Error("Unsafe agent identity");
  const local = project.get(name), trusted = global.get(name);
  if (local instanceof Error) throw local;
  if (trusted instanceof Error) throw trusted;
  if (!local && !trusted) throw new Error("Unknown agent policy: " + name);
  const ceiling = trusted ? parseScope(trusted.sandbox, cwd) : { read: [canonical(cwd)], write: [canonical(cwd)] };
  const scope = local ? compose(ceiling, parseScope(local.sandbox, cwd)) : ceiling;
  if ([...ceiling.read, ...ceiling.write, ...scope.read, ...scope.write].includes("/")) throw new Error("Whole-machine sandbox roots are not supported");
  if (trusted?.capabilities !== undefined && (!Array.isArray(trusted.capabilities)
    || trusted.capabilities.some(value => value !== "pi_config_apply"))) throw new Error("Unknown agent capability");
  const globalAllowed = parseAllowedAgents(trusted?.allowed_agents);
  const localAllowed = local?.allowed_agents === undefined ? globalAllowed : parseAllowedAgents(local.allowed_agents);
  // Project definitions may narrow delegation, never acquire it without a global grant.
  const allowedAgents = globalAllowed.filter(name => localAllowed.includes(name));
  // Project trust does not authorize a project to acquire global apply authority.
  return { scope, allowedAgents, configApply: !local && Array.isArray(trusted?.capabilities) && trusted.capabilities.includes("pi_config_apply") };
}
