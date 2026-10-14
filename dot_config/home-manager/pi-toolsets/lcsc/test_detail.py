"""Offline contracts for the local LCSC lookup adapter."""
import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

root = Path(os.environ.get("LCSC_SKILL_DIR", Path(__file__).parent / "skills/lcsc"))
sys.path.insert(0, str(root / "scripts"))
import detail_lcsc


class LookupTests(unittest.TestCase):
    def response(self, payload):
        return patch("urllib.request.urlopen", return_value=io.BytesIO(
            json.dumps(payload).encode()
        ))

    def test_preserves_retail_fields_and_zero_stock(self):
        product = {
            "productCode": "C14663", "stockNumber": 0,
            "productPriceList": [{"ladder": 50, "usdPrice": 0.0142}],
            "paramVOList": [{"paramNameEn": "Voltage Rating", "paramValueEn": "50V"}],
        }
        with self.response({"code": 200, "result": product}) as request:
            result = detail_lcsc.lookup("c14663")
        self.assertEqual(result["product"], product)
        self.assertNotIn("minBuyNumber", result["product"])
        self.assertIn("not JLCPCB", result["source"])
        self.assertIn("productCode=C14663", request.call_args.args[0].full_url)
        self.assertEqual(request.call_args.kwargs["timeout"], 20)

    def test_rejects_invalid_code_without_network(self):
        with patch("urllib.request.urlopen") as request:
            with self.assertRaises(ValueError):
                detail_lcsc.lookup("STM32")
            request.assert_not_called()

    def test_rejects_api_errors_missing_and_wrong_product(self):
        for payload in (
            {"code": 500, "result": {"productCode": "C14663"}},
            {"code": 200, "result": None},
            {"code": 200, "result": {"productCode": "C1"}},
            {"code": 200, "result": {}},
            [],
        ):
            with self.subTest(payload=payload), self.response(payload):
                with self.assertRaises(ValueError):
                    detail_lcsc.lookup("C14663")


if __name__ == "__main__":
    unittest.main()
