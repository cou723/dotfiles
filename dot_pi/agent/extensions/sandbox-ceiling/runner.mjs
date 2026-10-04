import { pathToFileURL } from "node:url";

let input = "";
for await (const chunk of process.stdin) input += chunk;
try {
  /** @type {{ sdkEntry: string, cwd: string, tool: keyof typeof factories, id: string, input: import("typebox").Static<import("typebox").TSchema> }} */
  const request = JSON.parse(input);
  /** @type {typeof import("@earendil-works/pi-coding-agent")} */
  const sdk = await import(pathToFileURL(request.sdkEntry).href);
  const factories = {
    read: sdk.createReadTool,
    grep: sdk.createGrepTool,
    find: sdk.createFindTool,
    ls: sdk.createLsTool,
    edit: sdk.createEditTool,
    write: sdk.createWriteTool,
    bash: sdk.createBashTool,
  };
  if (!Object.hasOwn(factories, request.tool)) throw new Error("Unknown sandbox tool");
  // The request crosses JSON here; runtime validation is a separate protocol concern.
  /** @type {{ execute(id: string, input: unknown, signal: AbortSignal): Promise<import("@earendil-works/pi-coding-agent").AgentToolResult<unknown>> }} */
  const tool = factories[request.tool](request.cwd);
  const controller = new AbortController();
  // The original Pi tools execute inside the mount namespace, including their
  // filesystem traversals and shell descendants. No host filesystem fallback.
  const result = await tool.execute(request.id, request.input, controller.signal);
  process.stdout.write(JSON.stringify({ result }));
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      error: String(
        /** @type {{message?: unknown} | null | undefined} */ (error)?.message ?? error,
      ),
    }),
  );
}
