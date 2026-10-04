import { spawn } from "node:child_process";

let input = "";
for await (const chunk of process.stdin) input += chunk;
try {
  const request = JSON.parse(input);
  // No host config/hooks, scripts, external downloads, host cache or host state.
  // Templates are still trusted code, but execute within the same OS sandbox.
  const args = ["--config", "/dev/null", "--config-format", "toml",
    "--source", request.sourceDir, "--destination", request.homeDir,
    "--persistent-state", "/tmp/pi-config-state.db", "--cache", "/tmp/pi-config-cache",
    "--refresh-externals=never", "--no-tty", "--no-pager"];
  if (request.dryRun) args.push("--dry-run");
  if (request.overwrite) args.push("--force");
  args.push("apply", "--exclude", "scripts", "--", ...request.targets);
  const result = await new Promise((resolve, reject) => {
    const child = spawn(request.executable, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const cap = 1024 * 1024;
    child.stdout.on("data", data => { stdout += data; if (Buffer.byteLength(stdout) > cap) child.kill("SIGKILL"); });
    child.stderr.on("data", data => { stderr = (stderr + data).slice(-16000); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stdout) : reject(new Error("chezmoi apply failed: " + stderr)));
  });
  process.stdout.write(JSON.stringify({ output: result }));
} catch (error) {
  process.stdout.write(JSON.stringify({ error: String(error?.message ?? error) }));
}
