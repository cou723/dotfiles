import type { Plugin } from "@opencode-ai/plugin"
import { experimental_evaluate as evaluate } from "ai"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const TARGET_ROOTS = ["/home/coura/ghq/github.com/cou723/replicad"]
const PRINCIPLES_DIRECTORY = path.join("docs", "principles")
const MODEL = "typesafe-ai/jev"
const APPROVAL_THRESHOLD = 0.5
const MAX_CONTEXT_CHARACTERS = 24_000

function isInside(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return markdownFiles(entryPath)
      return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : []
    }),
  )
  return files.flat().sort()
}

async function loadPrinciples(root: string) {
  const directory = path.join(root, PRINCIPLES_DIRECTORY)
  const files = await markdownFiles(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return []
    throw error
  })

  const documents = await Promise.all(
    files.map(async (file) => ({
      path: path.relative(root, file),
      content: await readFile(file, "utf8"),
    })),
  )

  return documents
    .map(({ path: documentPath, content }) => `## ${documentPath}\n\n${content.trim()}`)
    .join("\n\n")
}

function boundedJson(value: unknown) {
  const serialized = JSON.stringify(value)
  if (serialized.length <= MAX_CONTEXT_CHARACTERS) return serialized
  return `${serialized.slice(0, MAX_CONTEXT_CHARACTERS)}\n[truncated by principle-guard]`
}

export const PrincipleGuard: Plugin = async ({ directory, worktree }) => {
  const currentDirectory = path.resolve(worktree || directory)
  const targetRoot = TARGET_ROOTS.find((root) => isInside(path.resolve(root), currentDirectory))
  if (!targetRoot) return {}

  let warnedAboutMissingKey = false
  const userRequests = new Map<string, string>()

  return {
    "chat.message": async (input, output) => {
      userRequests.set(input.sessionID, boundedJson(output.parts))
    },

    "experimental.chat.system.transform": async (_input, output) => {
      const principles = await loadPrinciples(targetRoot)
      if (!principles) return

      output.system.push(
        [
          "The following project principles govern decisions in this workspace.",
          "Treat narrower exceptions and more specific principles as overriding general ones.",
          "Optimize for substantive value and verifiability, not merely presentation or apparent completion.",
          "A separate evaluator checks tool actions. If it rejects an action, reconsider rather than repeating it unchanged.",
          principles,
        ].join("\n\n"),
      )
    },

    "tool.execute.before": async (input, output) => {
      const principles = await loadPrinciples(targetRoot)
      if (!principles) return

      if (!process.env.AI_GATEWAY_API_KEY) {
        if (!warnedAboutMissingKey) {
          console.warn("[principle-guard] AI_GATEWAY_API_KEY is not set; Jev checks are disabled")
          warnedAboutMissingKey = true
        }
        return
      }

      try {
        const result = await evaluate({
          model: MODEL,
          state: {
            workspace: currentDirectory,
            principles,
            userRequest: userRequests.get(input.sessionID) ?? "Unavailable",
            proposedAction: {
              tool: input.tool,
              arguments: boundedJson(output.args),
            },
          },
          questions: {
            compliant: {
              type: "boolean",
              instructions:
                "Considering applicable exceptions and specificity, does this proposed action comply with the project principles and advance substantive task value? Return true only when the action is justified by the available context.",
            },
          },
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(10_000),
        })

        const probability = result.answers.compliant.probability
        if (probability < APPROVAL_THRESHOLD) {
          throw new Error(
            `[principle-guard] Jev rejected this action (compliance probability ${probability.toFixed(3)}). Re-read the injected project principles, revise the approach, and do not repeat the same action unchanged.`,
          )
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("[principle-guard] Jev rejected")) {
          throw error
        }
        console.warn("[principle-guard] Jev evaluation failed; allowing action (fail-open)", error)
      }
    },
  }
}
