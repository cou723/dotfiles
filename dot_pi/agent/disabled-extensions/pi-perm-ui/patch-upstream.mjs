// pi-perm 0.1.8's deepMerge rejects null-prototype tables returned by modern
// smol-toml, discarding defaults. Keep the patched parser (security fixes) and
// accept both ordinary and null-prototype records. No policy rule is changed.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const file = require.resolve("pi-perm/core/config.ts");
const oldText = 'return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;';
const newText = 'return value !== null && typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);';
const source = readFileSync(file, "utf8");
if (!source.includes(newText)) {
  if (source.split(oldText).length !== 2) throw new Error("pi-perm compatibility patch no longer matches; review upstream before updating");
  writeFileSync(file, source.replace(oldText, newText));
  console.log("Applied pi-perm null-prototype TOML compatibility fix");
}
// Pass the ENTIRE command as one -c argument. Otherwise shell redirections,
// pipelines and substitutions are evaluated by the unsandboxed parent shell.
const srtFile = require.resolve("pi-perm/core/srt.ts");
const oldWrap = 'return `${shellQuote(srtBinary)} --settings ${shellQuote(settingsPath)} ${command}`;';
const newWrap = 'return `${shellQuote(srtBinary)} --settings ${shellQuote(settingsPath)} -c ${shellQuote(command)}`;';
const srtSource = readFileSync(srtFile, "utf8");
if (!srtSource.includes(newWrap)) {
  if (srtSource.split(oldWrap).length !== 2) throw new Error("pi-perm shell wrapping patch no longer matches");
  writeFileSync(srtFile, srtSource.replace(oldWrap, newWrap));
  console.log("Applied pi-perm whole-command sandbox wrapping fix");
}
