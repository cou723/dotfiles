#!/usr/bin/env python3
"""Read-only OpenCode session metrics; never print message bodies."""

import argparse
import json
import statistics
import subprocess
from collections import defaultdict
from urllib.parse import parse_qsl, quote, urlencode, urlsplit


FIELDS = ("input", "output", "reasoning", "cache_read", "cache_write")


def tokens_of(value):
    value = value or {}
    cache = value.get("cache") or {}
    return {"input": value.get("input", 0), "output": value.get("output", 0),
            "reasoning": value.get("reasoning", 0), "cache_read": cache.get("read", 0),
            "cache_write": cache.get("write", 0)}


def sum_tokens(items):
    return {key: sum(item[key] for item in items) for key in FIELDS}


def api(path):
    result = subprocess.run(["opencode", "api", "get", path], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"opencode api get failed for {path}: {result.stderr.strip()[:400]}")
    return json.loads(result.stdout)


def pages(path, limit=100):
    cursor = None
    seen = set()
    url = urlsplit(path)
    filters = dict(parse_qsl(url.query))
    while True:
        params = {key: value for key, value in filters.items() if not (cursor and key == "order")}
        params["limit"] = str(limit)
        if cursor:
            params["cursor"] = cursor
        response = api(f"{url.path}?{urlencode(params)}")
        yield from response["data"]
        cursor = response.get("cursor", {}).get("next")
        if not cursor:
            return
        if cursor in seen:
            raise RuntimeError("pagination cursor repeated")
        seen.add(cursor)


def text_chars(value):
    if isinstance(value, str):
        return len(value)
    if isinstance(value, list):
        return sum(text_chars(item) for item in value)
    if isinstance(value, dict):
        return sum(text_chars(item) for item in value.values())
    return 0


def inspect(session_id, include_children, visited):
    if session_id in visited:
        return []
    visited.add(session_id)
    info = api(f"/api/session/{quote(session_id, safe='')}")["data"]
    models = defaultdict(list)
    tools = defaultdict(lambda: {"calls": 0, "failed": 0, "unfinished": 0,
                                 "input_chars": 0, "output_chars": 0, "durations_ms": []})
    steps = []
    messages = pages(f"/api/session/{quote(session_id, safe='')}/message?order=asc")
    for message in messages:
        if message.get("type") != "assistant":
            continue
        if message.get("tokens") is not None:
            usage = tokens_of(message["tokens"])
            steps.append(usage)
            model = message.get("model") or {}
            label = f"{model.get('providerID', '?')}/{model.get('modelID', '?')}"
            models[label].append(usage)
        for part in message.get("content", []):
            if part.get("type") != "tool":
                continue
            entry = tools[part.get("name", "unknown")]
            entry["calls"] += 1
            state = part.get("state") or {}
            status = state.get("status")
            entry["failed"] += status == "error"
            entry["unfinished"] += status not in ("completed", "error")
            entry["input_chars"] += text_chars(state.get("input"))
            entry["output_chars"] += text_chars(state.get("content"))
            if status == "error":
                entry["output_chars"] += text_chars(state.get("error"))
            start = (part.get("time") or {}).get("ran")
            end = (part.get("time") or {}).get("completed")
            if start is not None and end is not None and end >= start:
                entry["durations_ms"].append(end - start)
    metric = {
        "id": info["id"], "parentID": info.get("parentID"), "title": info.get("title"),
        "outcome": info.get("outcome"), "session_tokens": tokens_of(info.get("tokens")),
        "step_tokens": sum_tokens(steps), "steps_with_tokens": len(steps),
        "models": {key: {"steps": len(values), "tokens": sum_tokens(values)}
                   for key, values in sorted(models.items())},
        "tools": {key: {"calls": val["calls"], "failed": val["failed"],
                        "unfinished": val["unfinished"], "input_chars": val["input_chars"],
                        "output_chars": val["output_chars"],
                        "duration_p50_ms": statistics.median(val["durations_ms"])
                        if val["durations_ms"] else None}
                  for key, val in sorted(tools.items())},
    }
    results = [metric]
    if include_children:
        children = pages(f"/api/session?parentID={quote(session_id, safe='')}")
        for child in children:
            results.extend(inspect(child["id"], True, visited))
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("session_id", help="OpenCode session ID (ses_...)")
    parser.add_argument("--no-children", action="store_true")
    args = parser.parse_args()
    if not args.session_id.startswith("ses_"):
        parser.error("session ID must start with ses_")
    try:
        sessions = inspect(args.session_id, not args.no_children, set())
    except (KeyError, ValueError, RuntimeError) as exc:
        parser.exit(1, f"Error: {exc}\n")
    print(json.dumps({"sessions": sessions,
                      "total": {"sessions": len(sessions),
                                "tokens": sum_tokens(s["session_tokens"] for s in sessions)},
                      "tool_unit": "characters (not tokens)"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
