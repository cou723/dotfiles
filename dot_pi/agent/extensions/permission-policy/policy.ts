import { lstatSync, readlinkSync, realpathSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const MODES = ["readonly", "dev", "meta", "live"] as const
export type Mode = typeof MODES[number]

export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && MODES.some(mode => mode === value)
}

export function normalizePath(raw: string, home: string): string {
  let value = raw.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
  if (value.startsWith("@")) value = value.slice(1)
  if (value.includes("\0")) throw new Error("NUL in path")
  if (value === "~") return home
  if (value.startsWith("~/")) return path.join(home, value.slice(2))
  if (value.startsWith("file://")) return fileURLToPath(value)
  return value
}

export function canonicalPath(value: string): string {
  let current = path.resolve(value)
  const tail: string[] = []
  for (let hops = 0; hops < 64; hops++) {
    try {
      return path.join(realpathSync(current), ...tail)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error
      try {
        if (lstatSync(current).isSymbolicLink()) {
          current = path.resolve(path.dirname(current), readlinkSync(current))
          continue
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
      const parent = path.dirname(current)
      if (parent === current) throw new Error("Cannot resolve path")
      tail.unshift(path.basename(current))
      current = parent
    }
  }
  throw new Error("Too many symlink resolutions")
}

export function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
}

export function permittedPath(raw: string, cwd: string, home: string, roots: readonly string[]): string {
  const lexical = path.resolve(cwd, normalizePath(raw, home))
  const target = canonicalPath(lexical)
  // Both names must be in scope: an allowed-looking symlink cannot expand authority.
  if (!roots.some(root => isWithin(path.resolve(root), lexical) && isWithin(canonicalPath(root), target))) {
    throw new Error("Target is outside the permitted roots")
  }
  return target
}

export function isSensitive(target: string): boolean {
  return target.split(path.sep).some(segment =>
    [".git", "auth.json", "oauth.json", "mcp-auth.json", "sessions", "cache"].includes(segment)
    || segment === ".env" || segment.startsWith(".env."),
  )
}

export function mutationRoots(mode: Mode, cwd: string, sourceRoot: string, agentDir: string): string[] {
  if (mode === "meta") return [path.join(sourceRoot, "dot_pi", "agent")]
  if (mode !== "dev") return []
  const project = canonicalPath(cwd)
  // Starting in a parent of the settings must not grant Dev authority over them.
  if (isWithin(project, canonicalPath(sourceRoot)) || isWithin(canonicalPath(sourceRoot), project)
    || isWithin(project, canonicalPath(agentDir)) || isWithin(canonicalPath(agentDir), project)) return []
  return [cwd]
}

export const APPLY_ENTRIES = [
  "AGENTS.md", "settings.json", "models.json", "mcp.json",
  "agents", "skills", "extensions", "permission-mode",
] as const

export function applyRoots(agentDir: string): string[] {
  return APPLY_ENTRIES.map(entry => path.join(agentDir, entry))
}

/** A deliberately small literal grammar, not a general shell parser. */
function literalWords(command: string): string[] | undefined {
  const words: string[] = []
  let index = 0
  while (index < command.length) {
    while (command[index] === " " || command[index] === "\t") index++
    if (index === command.length) break
    const quote = command[index] === "'" || command[index] === '"' ? command[index++] : undefined
    const start = index
    while (index < command.length && (quote ? command[index] !== quote : !/[ \t]/.test(command[index]))) index++
    if (quote && index === command.length) return undefined
    const word = command.slice(start, index)
    if (!word || /[\r\n\0$`\\;&|<>(){}*?\[\]!]/.test(word) || (!quote && /['"]/.test(word))) return undefined
    words.push(word)
    if (quote) {
      index++
      if (index < command.length && !/[ \t]/.test(command[index])) return undefined
    }
  }
  return words
}

export type ApplyRequest = { targets: string[]; dryRun: boolean }

export function parseApply(command: string, cwd: string, home: string, agentDir: string): ApplyRequest | undefined {
  const words = literalWords(command)
  if (!words || !["chezmoi", "che"].includes(words[0]) || words[1] !== "apply") return undefined
  const dryRun = words[2] === "--dry-run"
  const targets = words.slice(dryRun ? 3 : 2)
  if (!targets.length || targets.some(target => target.startsWith("-"))) return undefined
  const roots = applyRoots(agentDir)
  return {
    dryRun,
    targets: [...new Set(targets.map(target => {
      const resolved = permittedPath(target, cwd, home, roots)
      if (isSensitive(resolved)) throw new Error("Sensitive target is not applicable")
      return resolved
    }))],
  }
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function applyCommand(executable: string, sourceRoot: string, home: string, scratch: string, request: ApplyRequest): string {
  // No blanket apply, user-supplied options, aliases, scripts, or external refreshes.
  const args = [executable, "apply", "--source", sourceRoot, "--destination", home,
    "--exclude=scripts", "--refresh-externals=never", "--no-tty",
    "--cache", path.join(scratch, "chezmoi-cache"),
    "--persistent-state", path.join(scratch, "chezmoistate.boltdb"),
    ...(request.dryRun ? ["--dry-run"] : []), ...request.targets]
  return args.map(shellQuote).join(" ")
}

const READ_TOOLS = new Set([
  "codemode", "ask_question", "web_search", "fetch_content", "get_search_content", "source_check",
  "lsp_diagnostics", "lsp_hover", "lsp_definition", "lsp_references", "lsp_symbols", "lsp_rename",
  "lsp_code_actions", "lsp_completions", "code_overview", "ast_search", "show_plan",
  "list_mcp_resources", "list_mcp_resource_templates", "read_mcp_resource",
])

const GITHUB_READ_TOOLS = new Set([
  "get_me", "get_label", "get_latest_release", "get_release_by_tag", "get_tag",
  "get_file_contents", "get_repository_tree", "list_branches", "list_commits", "get_commit",
  "list_releases", "list_tags", "list_issues", "search_issues", "search_code", "search_repositories",
  "search_users", "list_pull_requests", "search_pull_requests", "list_issue_types",
])

export function toolAction(mode: Mode, name: string, input: Record<string, unknown>): "allow" | "ask" | "deny" {
  if (name === "subagent") {
    if (["list", "status", "guide", "models"].includes(String(input.action))) return "allow"
    if ((mode === "meta" || mode === "dev") && input.agent === "git-commit" && !input.action) return "ask"
    if (mode === "live" && input.agent === "todoist-add-task" && !input.action) return "ask"
    return "deny"
  }
  if (name === "mcp__github__issue_read" || name === "mcp__github__pull_request_read") return "allow"
  if (name.startsWith("mcp__github__")) {
    const operation = name.slice("mcp__github__".length)
    if (GITHUB_READ_TOOLS.has(operation)) return "allow"
    return mode === "dev" || mode === "meta" ? "ask" : "deny"
  }
  if (name.startsWith("mcp__amazon_products__") || name.startsWith("mcp__amazon-products__")) {
    return mode === "live" ? "allow" : "deny"
  }
  if (name.startsWith("mcp__todoist__")) return mode === "live" ? "ask" : "deny"
  if (name === "mcp__context7__resolve_library_id" || name === "mcp__context7__query_docs") return "allow"
  if (["list_mcp_resources", "list_mcp_resource_templates", "read_mcp_resource"].includes(name)) {
    const server = input.server
    if (server === "amazon-products" || server === "todoist") return mode === "live" ? "allow" : "deny"
    // Unscoped listing must not expose services disabled in this mode.
    if (server === undefined) return mode === "live" ? "allow" : "deny"
  }
  return READ_TOOLS.has(name) ? "allow" : "deny"
}
