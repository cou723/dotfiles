import type { AgentPolicy } from "./definitions.ts";

export const DELEGATION_TOOLS = new Set([
  "subagent",
  "get_subagent_result",
  "steer_subagent",
  "task",
]);
const AGENT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export function agentName(value: unknown): string {
  if (typeof value !== "string" || !AGENT_NAME.test(value))
    throw new Error("Expected a literal agent name");
  return value.toLowerCase();
}

export function parseAllowedAgents(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new Error("allowed_agents requires an array of literal agent names");
  return [...new Set(value.map(agentName))];
}

export type AgentRecordLookup = { getRecord(id: string): { type: string } | undefined };

export function assertDelegationAllowed(
  caller: string,
  allowed: readonly string[],
  toolName: string,
  input: unknown,
  policies: ReadonlyMap<string, AgentPolicy | Error>,
  records?: AgentRecordLookup,
): void {
  if (toolName === "task")
    throw new Error("Use subagent; the alternate task delegation route is disabled");
  if (!DELEGATION_TOOLS.has(toolName)) throw new Error("Unknown delegation tool");
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid delegation input");
  const request = input as Record<string, unknown>;
  let target: string;
  if (toolName !== "subagent" || request.resume !== undefined) {
    const id = toolName === "subagent" ? request.resume : request.agent_id;
    if (typeof id !== "string" || !id) throw new Error("Expected an existing agent ID");
    // A caller-supplied subagent_type does not identify the session being resumed.
    const record = records?.getRecord(id);
    if (!record) throw new Error("Unknown agent record: " + id);
    target = agentName(record.type);
  } else {
    target = agentName(request.subagent_type);
  }
  if (!allowed.includes(target))
    throw new Error(`${caller} may not call ${target}; allowed_agents: [${allowed.join(", ")}]`);
  const matches = [...policies].filter(([name]) => agentName(name) === target);
  // Unknown types fall back to general-purpose in the upstream spawner. Never admit that fallback.
  if (matches.length !== 1) throw new Error("Unknown or ambiguous target agent policy: " + target);
  const policy = matches[0][1];
  if (policy instanceof Error) throw policy;
}
