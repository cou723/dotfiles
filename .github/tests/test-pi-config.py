"""Run with python3 .github/tests/test-pi-config.py (no credentials required)."""
import json
from pathlib import Path
import re
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
        self.assertEqual(config["defaultModel"], "gpt-6.1-sol")
        self.assertEqual(config["defaultTools"], ["+codemode"])
        self.assertEqual(config["packages"], ["npm:pi-verdict@0.15.0"])
        self.assertNotIn("deviceId", config)
        self.assertNotIn("lastChangelogVersion", config)

    def test_preserves_local_settings(self):
        config = merge(json.dumps({
            "deviceId": "test-device", "lastChangelogVersion": "test-version",
            "theme": "light", "defaultModel": "old-model", "packages": ["old-package"],
        }))
        self.assertEqual(config["deviceId"], "test-device")
        self.assertEqual(config["lastChangelogVersion"], "test-version")
        self.assertEqual(config["theme"], "light")
        self.assertEqual(config["defaultModel"], "gpt-6.1-sol")
        self.assertEqual(config["packages"], ["npm:pi-verdict@0.15.0"])

    def test_idempotent(self):
        first = merge("{}")
        self.assertEqual(merge(json.dumps(first)), first)

    def test_rejects_non_object(self):
        with self.assertRaises(subprocess.CalledProcessError):
            merge("[]")

    def test_verdict_config(self):
        config = json.loads((AGENT / "config/pi-verdict.json").read_text())
        self.assertEqual(config["classifierModel"], "permission-chat/luna")
        self.assertTrue(config["builtinDenyFloor"])
        self.assertEqual(config["codemodeNestedCalls"], "gate")
        self.assertTrue(config["audit"])
        self.assertTrue(config["auditRedactSecrets"])
        self.assertIsNone(config["toggleShortcut"])
        self.assertIsNone(config["classifierFallbackModel"])
        self.assertIn("codemode", config["ignoreTools"])
        self.assertNotIn("bash", config["ignoreTools"])
        self.assertNotIn("migration_probe", config["ignoreTools"])

    def test_sensitive_path_regexes(self):
        config = json.loads((AGENT / "config/pi-verdict.json").read_text())
        deny = [re.compile(pattern) for pattern in config["deny"]]
        sensitive = [
            "/home/user/.ssh/config", "cat ~/.ssh/id_rsa",
            "/Users/user/.gnupg/key", "/home/user/.aws/credentials",
            "cat /home/user/.pi/agent/auth.json",
            "/home/user/.pi/agent/extensions/20-permission-luna-chat.ts",
            "/project/.env", "/project/app.env", "/project/.env.production",
        ]
        for value in sensitive:
            with self.subTest(value=value):
                self.assertTrue(any(pattern.search(value) for pattern in deny))
        for value in ["/project/.env.example", "/project/README.md", "git status --short"]:
            with self.subTest(value=value):
                self.assertFalse(any(pattern.search(value) for pattern in deny))

    def test_retired_configs_not_managed(self):
        self.assertFalse((AGENT / "extensions/pi-permission-classifier/config.json").exists())
        self.assertFalse((AGENT / "extensions/private_pi-permission-system/config.json").exists())

    def test_alias_exists(self):
        content = (AGENT / "extensions/20-permission-luna-chat.ts").read_text()
        self.assertIn('id: "luna"', content)
        self.assertIn('type: "chat"', content)
        self.assertIn('reasoning: "off"', content)
        self.assertIn('AbortSignal.timeout(15000)', content)
        self.assertNotIn('readFile', content)


if __name__ == "__main__":
    unittest.main()
