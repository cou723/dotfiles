// The published bundled runtime has non-executable Linux seccomp helpers.
// Restore only their executable bits; do not modify package source or policy.
import { chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve("@xzzpig/pi-sandbox"));
const runtimeRequire = createRequire(join(packageRoot, "index.ts"));
const runtimeRoot = dirname(runtimeRequire.resolve("@xzzpig/sandbox-runtime/package.json"));
for (const arch of ["x64", "arm64"]) {
  const file = join(runtimeRoot, "vendor/seccomp", arch, "apply-seccomp");
  if (existsSync(file)) chmodSync(file, 0o755);
}
console.log("Prepared bundled sandbox seccomp helpers");
