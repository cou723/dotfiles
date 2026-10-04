import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type Scope = { read: string[]; write: string[] };

export function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep))
  );
}

export function canonical(raw: string): string {
  let current = path.resolve(raw);
  const tail: string[] = [];
  for (let hops = 0; hops < 128; hops++) {
    try {
      return path.join(realpathSync(current), ...tail);
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      try {
        if (lstatSync(current).isSymbolicLink()) {
          current = path.resolve(path.dirname(current), readlinkSync(current));
          continue;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const parent = path.dirname(current);
      if (parent === current) throw new Error("Cannot canonicalize path", { cause: error });
      tail.unshift(path.basename(current));
      current = parent;
    }
  }
  throw new Error("Too many symlink resolutions");
}

export function expand(raw: string, cwd: string): string {
  if (raw.includes("\0")) throw new Error("NUL in path");
  let value = raw.replace(/\$\{cwd\}/g, cwd).replace(/\$\{home\}/g, homedir());
  if (value === "~") value = homedir();
  else if (value.startsWith("~/")) value = path.join(homedir(), value.slice(2));
  if (/\$|[*?[\]]/.test(value)) throw new Error("Sandbox roots must be literal paths");
  return path.resolve(cwd, value);
}

export function parseScope(value: unknown, cwd: string): Scope {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("sandbox requires read/write arrays");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["read", "write"].includes(key)))
    throw new Error("Unknown sandbox field");
  const roots = (key: string) => {
    const items = record[key];
    if (!Array.isArray(items) || items.some((item) => typeof item !== "string"))
      throw new Error("sandbox." + key + " requires a string array");
    return minimize(items.map((item) => canonical(expand(item, cwd))));
  };
  const scope = { read: roots("read"), write: roots("write") };
  if (scope.write.some((root) => !scope.read.some((read) => inside(read, root)))) {
    throw new Error("Every writable root must also be readable");
  }
  return scope;
}

export function minimize(roots: string[]): string[] {
  return [...new Set(roots)]
    .filter((root) => !roots.some((other) => other !== root && inside(other, root)))
    .sort();
}

export function intersect(a: string[], b: string[]): string[] {
  return minimize(
    a.flatMap((left) =>
      b.flatMap((right) => (inside(left, right) ? [right] : inside(right, left) ? [left] : [])),
    ),
  );
}

export function compose(machine: Scope, agent: Scope, invocation?: Scope): Scope {
  const scope = {
    read: intersect(machine.read, agent.read),
    write: intersect(machine.write, agent.write),
  };
  return invocation
    ? {
        read: intersect(scope.read, invocation.read),
        write: intersect(scope.write, invocation.write),
      }
    : scope;
}

export function permitted(raw: string, cwd: string, roots: string[]): string {
  const lexical = expand(raw.startsWith("@") ? raw.slice(1) : raw, cwd);
  const resolved = canonical(lexical);
  if (!roots.some((root) => inside(root, lexical) && inside(root, resolved))) {
    throw new Error("[sandbox-ceiling] Path is outside the filesystem ceiling: " + raw);
  }
  return resolved;
}
