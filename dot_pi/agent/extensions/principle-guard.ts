import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"

const TARGET_ROOT = path.join(os.homedir(), "ghq/github.com/cou723/replicad")
const MAX_CONTEXT_CHARACTERS = 24_000

function isInside(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return markdownFiles(file)
    return entry.isFile() && entry.name.endsWith(".md") ? [file] : []
  }))
  return files.flat().sort()
}

async function loadPrinciples() {
  const files = await markdownFiles(path.join(TARGET_ROOT, "docs/principles"))
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return []
      throw error
    })
  return (await Promise.all(files.map(async (file) =>
    `## ${path.relative(TARGET_ROOT, file)}\n\n${(await readFile(file, "utf8")).trim()}`,
  ))).join("\n\n")
}

function boundedJson(value: unknown) {
  const serialized = JSON.stringify(value) ?? "Unavailable"
  return serialized.length <= MAX_CONTEXT_CHARACTERS
    ? serialized
    : `${serialized.slice(0, MAX_CONTEXT_CHARACTERS)}\n[truncated by principle-guard]`
}

export default function (pi: ExtensionAPI) {
  let userRequest = "Unavailable"
  let warned = false

  pi.on("before_agent_start", async (event, ctx) => {
    if (!isInside(TARGET_ROOT, path.resolve(ctx.cwd))) return
    userRequest = event.prompt
    const principles = await loadPrinciples()
    if (!principles) return
    return {
      systemPrompt: `${event.systemPrompt}\n\nThe following project principles govern decisions in this workspace.\nTreat narrower exceptions and more specific principles as overriding general ones.\nOptimize for substantive value and verifiability, not merely presentation or apparent completion.\nIf the evaluator rejects an action, reconsider rather than repeating it unchanged.\n\n${principles}`,
    }
  })

  pi.on("tool_call", async (event, ctx) => {
    if (!isInside(TARGET_ROOT, path.resolve(ctx.cwd))) return
    const principles = await loadPrinciples()
    if (!principles) return
    if (!process.env.AI_GATEWAY_API_KEY) {
      if (!warned) {
        ctx.ui.notify("[principle-guard] AI_GATEWAY_API_KEY未設定のためJev評価は無効です", "warning")
        warned = true
      }
      return
    }
    try {
      const model = ctx.modelRegistry.getModelOfType("classifier", "vercel-ai-gateway", "typesafe-ai/jev")
      if (!model) throw new Error("Jev classifier is unavailable")
      const result = await ctx.modelRegistry.classify(model, {
        state: {
          workspace: ctx.cwd,
          principles,
          userRequest: boundedJson(userRequest),
          proposedAction: { tool: event.toolName, arguments: boundedJson(event.input) },
        },
        questions: {
          compliance: {
            type: "choice",
            instructions: "Considering applicable exceptions and specificity, does this proposed action comply with the project principles and advance substantive task value?",
            criteria: {
              compliant: "The action is justified by the available context and applicable principles.",
              rejected: "The action is not justified by the available context or violates applicable principles.",
            },
          },
        },
      }, { signal: AbortSignal.timeout(10_000) })
      const answer = result.stopReason === "stop" ? result.answers.compliance : undefined
      if (!answer || answer.type !== "choice") throw new Error("Jev returned no compliance probability")
      const probability = answer.probabilities.compliant
      if (typeof probability !== "number" || !Number.isFinite(probability)) throw new Error("Jev returned an invalid probability")
      if (probability < 0.5) {
        return {
          block: true,
          reason: `[principle-guard] Jev rejected this action (compliance probability ${probability.toFixed(3)}). Re-read the project principles, revise the approach, and do not repeat the same action unchanged.`,
        }
      }
    } catch {
      // Preserve the original fail-open behavior when the evaluator itself fails.
      ctx.ui.notify("[principle-guard] Jev評価に失敗したため操作を許可します（fail-open）", "warning")
    }
  })
}
