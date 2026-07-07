import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from extractor import normalize_bom_payload


class WindchillExtractorTests(unittest.TestCase):
    def test_normalize_bom_payload_creates_tree_structure(self) -> None:
        payload = {
            'value': [
                {
                    'id': 'parent-1',
                    'name': 'Parent Part',
                    'quantity': {'value': 2, 'unit': 'EA'},
                    'components': [
                        {'id': 'child-1', 'name': 'Child Part', 'quantity': 1}
                    ],
                }
            ]
        }

        result = normalize_bom_payload(payload, '572081', 'Bike', '2026-01-01T00:00:00.000Z')

        self.assertEqual(result['productId'], '572081')
        self.assertEqual(result['bom'][0]['name'], 'Parent Part')
        self.assertEqual(result['bom'][0]['quantity'], '2 EA')
        self.assertEqual(result['bom'][0]['children'][0]['name'], 'Child Part')

    def test_run_writes_output_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = os.path.join(tmpdir, 'windchill_extraction.json')
            from extractor import run

            result = run('572081', 'Bike', output_path)
            with open(output_path, 'r', encoding='utf-8') as fh:
                written = json.load(fh)

            self.assertEqual(result['productId'], '572081')
            self.assertEqual(written['productId'], '572081')


if __name__ == '__main__':
    unittest.main()
