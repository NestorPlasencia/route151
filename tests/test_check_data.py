import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('check_data', ROOT / 'scripts' / 'check-data.py')
checker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checker)
CATALOG = json.loads((ROOT / 'app' / 'games.json').read_text(encoding='utf-8'))


class CatalogTests(unittest.TestCase):
    def read_catalog(self, value, **formatting):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'games.json'
            path.write_text(json.dumps(value, **formatting), encoding='utf-8')
            return checker.games(path)

    def test_shared_catalog_is_independent_of_format_and_key_order(self):
        self.assertEqual(checker.games(), CATALOG)
        for formatting in ({'indent': 4, 'sort_keys': True}, {'separators': (',', ':')}):
            self.assertEqual(self.read_catalog(CATALOG, **formatting), CATALOG)

    def test_empty_and_invalid_catalogs_are_rejected(self):
        for value in ([], None, {}, [None], [{'id': 'yellow'}],
                      [{**CATALOG[0], 'gen': True}], [{**CATALOG[0], 'gen': 2}],
                      [{**CATALOG[0], 'data': '/../private/data'}],
                      [{**CATALOG[0], 'storage': None}], [{**CATALOG[0], 'hidden': 'Obstacle'}]):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.read_catalog(value)

    def test_duplicate_ids_and_storage_keys_are_rejected(self):
        for value in ([CATALOG[0], CATALOG[0]],
                      [CATALOG[0], {**CATALOG[1], 'storage': CATALOG[0]['storage']}],
                      [{**CATALOG[0], 'storage': {'done': 'ruta151-game', 'dex': 'ruta151-test-dex'}}],
                      [{**CATALOG[0], 'storage': {'done': 'ruta151-test', 'dex': 'ruta151-test-team'}}]):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.read_catalog(value)

    def test_malformed_json_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'games.json'
            path.write_text('{broken', encoding='utf-8')
            with self.assertRaises(ValueError):
                checker.games(path)

    def test_empty_and_unreadable_catalogs_fail_the_command(self):
        for result in ([], ValueError('invalid JSON'), FileNotFoundError('missing catalog')):
            options = {'side_effect': result} if isinstance(result, Exception) else {'return_value': result}
            with patch.object(checker, 'games', **options), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(checker.main(), 1)

    def test_missing_essential_files_are_errors(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(checker, 'PUBLIC', directory):
            errors, warnings = checker.check(CATALOG[0])
            self.assertFalse(warnings)
            for filename in ('gates.json', 'hm-gates.json', 'goals.json', 'nav.json'):
                self.assertIn(filename, errors[0])

    def test_invalid_game_data_fails_instead_of_crashing(self):
        with patch.object(checker, 'games', return_value=[CATALOG[0]]), \
                patch.object(checker, 'check', side_effect=ValueError('bad JSON')), \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(checker.main(), 1)


if __name__ == '__main__':
    unittest.main()
