import { spawn } from "node:child_process";
import { closeSync, constants, existsSync, openSync, realpathSync } from "node:fs";
import { inside, type Scope } from "./policy.ts";

export interface SandboxBackend {
  run(scope: Scope, cwd: string, argv: string[], input: string, signal?: AbortSignal): Promise<string>;
}

export type BackendConfig = {
  executable: string;
  runtimeRead: string[];
  protectedWrite: string[];
  timeoutMs: number;
};

export class BubblewrapBackend implements SandboxBackend {
  readonly config: BackendConfig;
  constructor(config: BackendConfig) { this.config = config; }

  args(scope: Scope, cwd: string, argv: string[]): string[] {
    if (process.platform !== "linux") throw new Error("V1 requires Linux bubblewrap");
    const args = ["--unshare-user", "--unshare-pid", "--die-with-parent", "--new-session", "--cap-drop", "ALL",
      "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--tmpfs", "/dev/shm"];
    const mounts = new Map<string, { source: string; writable: boolean }>();
    for (const root of [...this.config.runtimeRead, ...scope.read]) {
      if (!existsSync(root)) throw new Error("Sandbox mount root does not exist: " + root);
      const source = realpathSync(root);
      if (scope.read.includes(root) && source !== root) throw new Error("Sandbox root changed after policy resolution");
      mounts.set(root, { source, writable: false });
    }
    for (const root of scope.write) {
      if (!existsSync(root)) throw new Error("Writable sandbox roots must already exist: " + root);
      if (this.config.protectedWrite.some(protectedRoot => inside(protectedRoot, root))) {
        throw new Error("Sandbox policy/runtime paths are immutable");
      }
      const source = realpathSync(root);
      if (source !== root) throw new Error("Writable sandbox root changed after policy resolution");
      mounts.set(root, { source, writable: true });
    }
    // Mount shallow-first: a broad read grant must not mask a narrower write grant.
    for (const [destination, mount] of [...mounts].sort(([a], [b]) => a.split("/").length - b.split("/").length)) {
      args.push(mount.writable ? "--bind" : "--ro-bind", mount.source, destination);
    }
    // A private PID namespace and fresh /proc prevent /proc/<parent>/root escape.
    for (const protectedRoot of this.config.protectedWrite) {
      if (existsSync(protectedRoot) && scope.write.some(root => inside(root, protectedRoot))) {
        args.push("--ro-bind", realpathSync(protectedRoot), protectedRoot);
      }
    }
    // An empty write sandbox still has disposable tmpfs, never host /tmp.
    if (!scope.read.some(root => inside(root, cwd))) args.push("--dir", cwd);
    args.push("--remount-ro", "/", "--chdir", cwd, "--", ...argv);
    return args;
  }

  async run(scope: Scope, cwd: string, argv: string[], input: string, signal?: AbortSignal): Promise<string> {
    const args = this.args(scope, cwd, argv);
    if (signal?.aborted) throw new Error("Sandbox operation aborted");
    const fds: number[] = [];
    try {
      // Pin bind sources before spawning. Mounting by pathname after validation
      // would permit a concurrent rename/symlink swap to expand the boundary.
      for (let i = 0; i < args.length; i++) {
        if (args[i] !== "--bind" && args[i] !== "--ro-bind") continue;
        const source = args[i + 1];
        const fd = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW);
        fds.push(fd);
        if (realpathSync("/proc/self/fd/" + fd) !== source) throw new Error("Sandbox mount source changed");
        args[i + 1] = "/proc/self/fd/" + (fds.length + 2);
        i += 2;
      }
    } catch (error) {
      for (const fd of fds) closeSync(fd);
      throw error;
    }
    return new Promise((resolve, reject) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(this.config.executable, args, {
        cwd, stdio: ["pipe", "pipe", "pipe", ...fds],
        // Network and credential/environment isolation are deliberately not promised in V1.
        env: { ...process.env, PI_OFFLINE: "1", TMPDIR: "/tmp" },
        });
      } catch (error) {
        reject(error);
        return;
      } finally {
        for (const fd of fds) closeSync(fd);
      }
      let stdout = "";
      let stderr = "";
      let failure: Error | undefined;
      const stop = (error: Error) => { failure ??= error; child.kill("SIGKILL"); };
      const abort = () => stop(new Error("Sandbox operation aborted"));
      const timer = setTimeout(() => stop(new Error("Sandbox operation timed out")), this.config.timeoutMs);
      signal?.addEventListener("abort", abort, { once: true });
      child.stdout!.on("data", data => {
        stdout += data;
        if (Buffer.byteLength(stdout) > 8 * 1024 * 1024) stop(new Error("Sandbox result exceeded 8 MiB"));
      });
      child.stderr!.on("data", data => { stderr = (stderr + data).slice(-16000); });
      child.stdin!.on("error", () => {});
      child.on("error", error => { failure = error; });
      child.on("close", code => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (failure) reject(failure);
        else if (code !== 0) reject(new Error("[sandbox-ceiling] Sandboxed execution failed: " + stderr));
        else resolve(stdout);
      });
      child.stdin!.end(input);
    });
  }
}
