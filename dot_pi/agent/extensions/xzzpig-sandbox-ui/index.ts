import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import sandbox, { getSandboxService } from "@xzzpig/pi-sandbox";
import { registerSandboxPicker } from "./ui.ts";

export default function (pi: ExtensionAPI) {
  // The package captures its startup profile during registration. Select a
  // named profile from the start so initialization failures remain fail-closed.
  // Respect a profile supplied by a child-session launcher.
  const key = "PI_SUBAGENT_SANDBOX_PROFILE";
  const inherited = process.env[key];
  if (inherited === undefined) process.env[key] = "workspace";
  try { sandbox(pi); }
  finally {
    if (inherited === undefined) delete process.env[key];
    else process.env[key] = inherited;
  }
  registerSandboxPicker(pi, getSandboxService);
}
