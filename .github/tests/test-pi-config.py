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
        [sys.executable, str(MODIFY)],
        input=settings,
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout)


class PiConfigTests(unittest.TestCase):
    def test_new_machine(self):
        config = merge("")
        self.assertEqual(config["defaultModel"], "gpt-6.1-sol")
        self.assertEqual(config["defaultTools"], ["+codemode"])
        self.assertEqual(len(config["packages"]), 2)
        self.assertNotIn("deviceId", config)
        self.assertNotIn("lastChangelogVersion", config)

    def test_preserves_local_settings(self):
        config = merge(json.dumps({
            "deviceId": "test-device",
            "lastChangelogVersion": "test-version",
            "theme": "light",
            "defaultModel": "old-model",
            "packages": ["old-package"],
        }))
        self.assertEqual(config["deviceId"], "test-device")
        self.assertEqual(config["lastChangelogVersion"], "test-version")
        self.assertEqual(config["theme"], "light")
        self.assertEqual(config["defaultModel"], "gpt-6.1-sol")
        self.assertEqual(config["packages"], [
            "npm:pi-permission-classifier",
            "npm:@gotgenes/pi-permission-system",
        ])

    def test_idempotent(self):
        first = merge("{}")
        self.assertEqual(merge(json.dumps(first)), first)

    def test_rejects_non_object(self):
        with self.assertRaises(subprocess.CalledProcessError):
            merge("[]")

    def test_permission_config(self):
        classifier = json.loads(
            (AGENT / "extensions/pi-permission-classifier/config.json").read_text()
        )
        policy = json.loads(
            (AGENT / "extensions/private_pi-permission-system/config.json").read_text()
        )
        self.assertEqual(classifier["timeoutMs"], 15000)
        self.assertEqual(policy["authorizerChain"], ["classifier"])
        self.assertEqual(policy["permission"]["*"], "ask")
        self.assertEqual(policy["permission"]["path"]["~/.pi/agent/auth.json"], "deny")


if __name__ == "__main__":
    unittest.main()
