#!/usr/bin/env python3
"""Read LCSC retail details without mixing in JLCPCB assembly inventory."""

import argparse
from datetime import datetime, timezone
import json
import re
import sys
import urllib.error
import urllib.request

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"


def lookup(code: str) -> dict:
    code = code.upper()
    if not re.fullmatch(r"C[0-9]+", code):
        raise ValueError("Expected an LCSC part number such as C14663")
    url = f"https://wmsc.lcsc.com/ftps/wm/product/detail?productCode={code}"
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        data = json.load(response)
    if not isinstance(data, dict) or data.get("code") != 200:
        raise ValueError("LCSC returned an unsuccessful response")
    result = data.get("result")
    if not isinstance(result, dict) or result.get("productCode") != code:
        raise ValueError("LCSC response is missing the requested product")
    # Preserve the source fields, including zero stock, quantity breaks, MOQ,
    # currency, warehouse stock and paramVOList. Missing fields remain missing.
    return {
        "source": "LCSC retail (not JLCPCB assembly)",
        "url": url,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "product": result,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("code", help="LCSC part number, e.g. C14663")
    args = parser.parse_args()
    try:
        result = lookup(args.code)
    except (ValueError, urllib.error.URLError, TimeoutError) as error:
        print(f"LCSC lookup failed: {error}", file=sys.stderr)
        return 2
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
