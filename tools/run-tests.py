#!/usr/bin/env python3
"""Developer-side test runner (never deployed). Python 3 standard library only.

    python3 tools/run-tests.py [--n 200000] [--seed 20261002] [--baseline DIR]

Serves the project folder read-only on localhost, opens tools/tests/sandbox.html
in headless Chromium/Chrome and prints its report. The page evaluates the shipped
files (names.js, dataset.js, data.js, generator.js) inside a sandbox with a fake
window, a fake fetch and a seeded Math.random (the generator has no seed hook).

--baseline DIR  optional copy of the project from before the data change; its
                person structure is compared with the new one.
Exit status 0 = all checks passed.
"""
import argparse
import functools
import html
import http.server
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def find_browser():
    for name in ('chromium-browser', 'chromium', 'google-chrome', 'google-chrome-stable', 'chrome'):
        path = shutil.which(name)
        if path:
            return path
    return None


class Handler(http.server.SimpleHTTPRequestHandler):
    baseline = None

    def translate_path(self, path):
        if self.baseline and path.startswith('/__baseline__/'):
            rel = path[len('/__baseline__/'):].split('?', 1)[0]
            return os.path.join(self.baseline, *[p for p in rel.split('/') if p and p != '..'])
        return super().translate_path(path)

    def log_message(self, *a):
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--n', type=int, default=200000)
    ap.add_argument('--seed', type=int, default=20261002)
    ap.add_argument('--baseline', default='')
    args = ap.parse_args()

    browser = find_browser()
    if not browser:
        print('No Chromium / Chrome found on PATH.')
        return 2

    Handler.baseline = os.path.abspath(args.baseline) if args.baseline else None
    handler = functools.partial(Handler, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    profile = tempfile.mkdtemp(prefix='random-life-test-')
    try:
        url = 'http://127.0.0.1:%d/tools/tests/sandbox.html?n=%d&seed=%d' % (port, args.n, args.seed)
        if Handler.baseline:
            url += '&baseline=' + '/__baseline__/'
        cmd = [browser, '--headless=new', '--no-sandbox', '--disable-gpu', '--user-data-dir=' + profile,
               '--virtual-time-budget=240000', '--dump-dom', url]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        m = re.search(r'<pre id="out">(.*?)</pre>', res.stdout, re.S)
        if not m:
            print('No report found. Browser stderr:\n' + res.stderr[-2000:])
            return 2
        text = html.unescape(m.group(1))
        print(text)
        return 0 if 'RESULT: PASS' in text else 1
    finally:
        srv.shutdown()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
