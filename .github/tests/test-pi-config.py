"""Run with python3 .github/tests/test-pi-config.py (no credentials required)."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
AGENT = ROOT / "dot_pi" / "agent"
MODIFY = AGENT / "modify_settings.json"


def merge(settings):
    result = subprocess.run(
        [sys.executable, str(MODIFY)], input=settings, text=True,
        capture_output=True, check=True,
    )
    return json.loads(result.stdout)


class PiConfigTests(unittest.TestCase):
    def test_new_machine(self):
        config = merge("")
        self.assertEqual(config["defaultProvider"], "openai")
        self.assertEqual(config["defaultModel"], "gpt-6.1-sol")
        self.assertEqual(config["defaultTools"], ["+codemode"])
        self.assertEqual(config["packages"], ["npm:@calesennett/pi-codex-fast"])
        self.assertNotIn("deviceId", config)
        self.assertNotIn("lastChangelogVersion", config)

    def test_preserves_local_settings(self):
        config = merge(json.dumps({
            "deviceId": "test-device", "lastChangelogVersion": "test-version",
            "theme": "light", "defaultModel": "old-model", "packages": ["old-package"],
            "retry": {"provider": {"maxRetries": 2}}, "mcp": {"test": "local"},
            "permissionGate": {"model": "old", "fallback": "allow", "obsolete": True},
        }))
        self.assertEqual(config["deviceId"], "test-device")
        self.assertEqual(config["lastChangelogVersion"], "test-version")
        self.assertEqual(config["theme"], "light")
        self.assertEqual(config["retry"], {"provider": {"maxRetries": 2}})
        self.assertEqual(config["mcp"], {"test": "local"})
        self.assertEqual(config["defaultModel"], "gpt-6.1-sol")
        self.assertEqual(config["packages"], ["npm:@calesennett/pi-codex-fast"])
        self.assertNotIn("permissionGate", config)

    def test_no_permission_gate_on_new_machine(self):
        self.assertNotIn("permissionGate", merge("{}"))

    def test_idempotent(self):
        first = merge("{}")
        self.assertEqual(merge(json.dumps(first)), first)

    def test_rejects_non_object(self):
        with self.assertRaises(subprocess.CalledProcessError):
            merge("[]")

    def test_retired_review_removed_on_apply(self):
        removals = (ROOT / ".chezmoiremove").read_text().splitlines()
        for name in ["20-permission-luna-chat.ts", "permission-review"]:
            self.assertFalse((AGENT / "extensions" / name).exists())
            self.assertIn(f".pi/agent/extensions/{name}", removals)

    def test_retired_configs_not_deployed(self):
        ignore = (ROOT / ".chezmoiignore").read_text()
        self.assertIn(".pi/agent/config/pi-verdict.json", ignore)
        self.assertFalse((AGENT / "extensions/pi-permission-classifier/config.json").exists())
        self.assertFalse((AGENT / "extensions/private_pi-permission-system/config.json").exists())

    def test_generated_files_and_audit_excluded(self):
        gitignore = (ROOT / ".gitignore").read_text()
        chezignore = (ROOT / ".chezmoiignore").read_text()
        self.assertIn("/dot_pi/agent/extensions/**/node_modules/", gitignore)
        self.assertIn(".pi/agent/extensions/*/node_modules", chezignore)
        self.assertIn("/dot_pi/pi-permission-gate.jsonl", gitignore)
        self.assertIn(".pi/pi-permission-gate.jsonl", chezignore)



if __name__ == "__main__":
    unittest.main()
