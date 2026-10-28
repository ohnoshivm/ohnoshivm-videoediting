import contextlib, importlib.util, io, json, sys, unittest
from pathlib import Path
from unittest.mock import patch

p = Path(__file__).resolve().parents[1] / 'skills/openverse-sfx/scripts/sfx_search.py'
spec = importlib.util.spec_from_file_location('sfx_search', p)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Response:
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self):
        return json.dumps({'results': [
            {'title': 'ok', 'license': 'by', 'source': 'freesound', 'duration': 500},
            {'title': 'restricted', 'license': 'by-nc', 'source': 'freesound', 'duration': 500},
            {'title': 'other source', 'license': 'cc0', 'source': 'unknown', 'duration': 500},
            {'title': 'long', 'license': 'cc0', 'source': 'jamendo', 'duration': 10000},
        ]}).encode()

class SearchTest(unittest.TestCase):
    def test_remote_and_local_filters(self):
        out = io.StringIO()
        with patch.object(sys, 'argv', ['sfx_search.py','--query','click','--max-results','3','--max-ms','5000']), \
             patch.object(m.urllib.request, 'urlopen', return_value=Response()) as request, \
             contextlib.redirect_stdout(out):
            m.main()
        result = json.loads(out.getvalue())
        self.assertEqual([x['title'] for x in result['results']], ['ok'])
        self.assertIn('license=cc0%2Cby%2Cpdm', request.call_args.args[0].full_url)
        self.assertIn('source=freesound%2Cjamendo', request.call_args.args[0].full_url)

if __name__ == '__main__': unittest.main()
