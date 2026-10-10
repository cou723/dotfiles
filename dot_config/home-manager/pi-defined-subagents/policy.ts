import { readFile, readdir, mkdir, mkdtemp, realpath, chmod, copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseDocument } from "yaml";

const AGENT_NAME = /^[a-z][a-z0-9_-]{0,63}$/;
const BUILTIN_TOOLS = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);
const DEFINITION_KEYS = new Set([
  "schema", "name", "enabled", "description", "tools", "workspace", "sandbox", "model", "timeoutMs", "resultMaxChars",
]);

export function parseDefinition(name: string, markdown: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(markdown);
  if (!match) throw new Error(`Invalid frontmatter: ${name}`);
  const doc = parseDocument(match[1], { uniqueKeys: true });
  if (doc.errors.length) throw new Error(`Invalid YAML: ${name}`);
  const data = doc.toJS();
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      Object.keys(data).some(key => !DEFINITION_KEYS.has(key)) ||
      data.schema !== 1 || data.name !== name || typeof data.enabled !== "boolean" ||
      typeof data.description !== "string" || !data.description.trim() ||
      !Array.isArray(data.tools) || data.tools.some((tool: unknown) => typeof tool !== "string" || !BUILTIN_TOOLS.has(tool)) ||
      new Set(data.tools).size !== data.tools.length || data.model !== "parent" ||
      !Number.isInteger(data.timeoutMs) || data.timeoutMs < 1000 || data.timeoutMs > 300000 ||
      !Number.isInteger(data.resultMaxChars) || data.resultMaxChars < 1 || data.resultMaxChars > 8000 ||
      !data.sandbox || typeof data.sandbox !== "object" || Array.isArray(data.sandbox) ||
      Object.keys(data.sandbox).sort().join(",") !== "filesystem,network") {
    throw new Error(`Malformed or unsupported definition: ${name}`);
  }
  // The compiler supports one explicit policy; a draft cannot be enabled by merely toggling enabled.
  if (data.enabled && (data.workspace !== "job-tmp" ||
      data.sandbox.filesystem !== "workspace-only" || data.sandbox.network !== "unrestricted")) {
    throw new Error(`Unsupported execution policy: ${name}`);
  }
  const prompt = match[2].trim();
  if (!prompt) throw new Error(`Empty role prompt: ${name}`);
  return Object.freeze({ ...data, tools: Object.freeze([...data.tools]), sandbox: Object.freeze({ ...data.sandbox }), prompt });
}

export async function loadRegistry(directory: string) {
  const registry = new Map<string, ReturnType<typeof parseDefinition>>();
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    const name = entry.name.slice(0, -3);
    if (!entry.isFile() || !AGENT_NAME.test(name)) {
      throw new Error(`Definition must be a direct Markdown file with a valid agent name: ${entry.name}`);
    }
    registry.set(name, parseDefinition(name, await readFile(join(directory, entry.name), "utf8")));
  }
  if (!registry.size) throw new Error(`No trusted agent definitions in ${directory}`);
  return registry;
}

export function validateRequest(params: unknown, registry: Map<string, ReturnType<typeof parseDefinition>>) {
  if (!params || typeof params !== "object" || Array.isArray(params) ||
      Object.keys(params).sort().join(",") !== "agent,task") {
    throw new Error("Exactly { agent, task } is required; execution-policy overrides are forbidden.");
  }
  const { agent, task } = params as { agent?: unknown; task?: unknown };
  if (typeof agent !== "string" || !registry.has(agent)) throw new Error("Unknown or missing agent definition.");
  if (typeof task !== "string" || !task.trim() || task.length > 16000) throw new Error("task must be non-empty and at most 16000 characters.");
  const definition = registry.get(agent)!;
  if (!definition.enabled) throw new Error(`${agent} is disabled; review its workflow and enable a supported execution policy first.`);
  return { definition, task };
}

async function canonicalDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  if (await realpath(path) !== path) throw new Error(`Refusing a symlinked runtime path: ${path}`);
}

export async function prepareJob(home: string, agentDirectory: string) {
  // Require canonical paths so ~/tmp or the runtime root cannot redirect write grants elsewhere.
  await canonicalDirectory(join(home, "tmp"));
  const root = join(home, "tmp", "pi-defined-subagents");
  await canonicalDirectory(root);
  await chmod(root, 0o700);
  const job = await mkdtemp(join(root, "job-"));
  const workspace = join(job, "work");
  const runtime = join(workspace, ".runtime");
  const agentDir = join(runtime, "agent");
  const tmp = join(runtime, "tmp");
  await mkdir(agentDir, { recursive: true, mode: 0o700 });
  await mkdir(tmp, { mode: 0o700 });
  try {
    // Snapshot only transport configuration, never the parent's settings, tools, extensions or sessions.
    for (const name of ["auth.json", "models.json"]) {
      try {
        await copyFile(join(agentDirectory, name), join(agentDir, name));
        await chmod(join(agentDir, name), 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return { job, workspace, runtime, agentDir, tmp };
  } catch (error) {
    await rm(job, { recursive: true, force: true });
    throw error;
  }
}

export function childEnvironment(job: Awaited<ReturnType<typeof prepareJob>>) {
  // Explicitly remove all inherited variables except a minimal executable/locale/TLS path set.
  // agwab merges this over process.env; undefined removes a variable in Node's spawn environment.
  const env: NodeJS.ProcessEnv = Object.fromEntries(Object.keys(process.env).map(name => [name, undefined]));
  for (const name of ["PATH", "LANG", "LC_ALL", "TZ", "SSL_CERT_FILE", "SSL_CERT_DIR", "NIX_SSL_CERT_FILE"]) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return { ...env, HOME: job.runtime, XDG_CONFIG_HOME: join(job.runtime, "config"),
    XDG_CACHE_HOME: join(job.runtime, "cache"), XDG_DATA_HOME: join(job.runtime, "data"),
    XDG_STATE_HOME: join(job.runtime, "state"), TMPDIR: job.tmp, TMP: job.tmp, TEMP: job.tmp,
    PI_CODING_AGENT_DIR: job.agentDir };
}

export async function boundedOutput(path: string, limit: number) {
  // Never load an arbitrarily large child output into the parent's memory/context.
  const { open } = await import("node:fs/promises");
  const file = await open(path, "r");
  try {
    const buffer = Buffer.alloc(limit * 4 + 4);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    const truncated = text.length > limit || (await file.stat()).size > bytesRead;
    return text.slice(0, limit) + (truncated ? "\n[Summary truncated; full result is in the artifact directory.]" : "");
  } finally { await file.close(); }
}
