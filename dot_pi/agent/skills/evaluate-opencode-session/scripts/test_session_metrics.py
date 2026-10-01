import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit


spec = importlib.util.spec_from_file_location("session_metrics", Path(__file__).with_name("session_metrics.py"))
metrics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metrics)


class SessionMetricsTests(unittest.TestCase):
    def test_pagination_keeps_parent_filter_but_drops_order_for_cursor(self):
        with patch.object(metrics, "api", side_effect=[
            {"data": [{"id": "one"}], "cursor": {"next": "opaque+cursor"}},
            {"data": [{"id": "two"}], "cursor": {"next": None}},
        ]) as api:
            self.assertEqual([x["id"] for x in metrics.pages("/api/session?parentID=ses_parent&order=asc")],
                             ["one", "two"])
        first = parse_qs(urlsplit(api.call_args_list[0].args[0]).query)
        second = parse_qs(urlsplit(api.call_args_list[1].args[0]).query)
        self.assertEqual(first["order"], ["asc"])
        self.assertEqual(second["parentID"], ["ses_parent"])
        self.assertEqual(second["cursor"], ["opaque+cursor"])
        self.assertNotIn("order", second)

    def test_child_sessions_are_counted_once_with_distinct_tokens(self):
        def fake_api(path):
            if path == "/api/session/ses_parent":
                return {"data": {"id": "ses_parent", "tokens": {"input": 10}}}
            if path == "/api/session/ses_child":
                return {"data": {"id": "ses_child", "parentID": "ses_parent", "tokens": {"input": 20}}}
            if path.startswith("/api/session?"):
                parent = parse_qs(urlsplit(path).query)["parentID"][0]
                return {"data": [{"id": "ses_child"}, {"id": "ses_child"}]
                        if parent == "ses_parent" else [], "cursor": {"next": None}}
            return {"data": [], "cursor": {"next": None}}

        with patch.object(metrics, "api", side_effect=fake_api):
            sessions = metrics.inspect("ses_parent", True, set())
        self.assertEqual([s["id"] for s in sessions], ["ses_parent", "ses_child"])
        self.assertEqual(metrics.sum_tokens(s["session_tokens"] for s in sessions)["input"], 30)


if __name__ == "__main__":
    unittest.main()
