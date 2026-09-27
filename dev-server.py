#!/usr/bin/env python3
"""Development-only static server for Random Life.

Serves this directory over HTTP and falls back to index.html for the
client-side share routes (/life/v1/<seed>), which have no physical file.
Lets you test shareable life URLs locally, e.g.:

    python3 dev-server.py 8000
    # then open http://localhost:8000/life/v1/7f3a2c91

DEV ONLY. Production (Raspberry Pi + Caddy) serves these same static files
directly; this script is never required there. See README for the one-line
Caddy fallback needed in production.
"""

import http.server
import os
import sys


class SpaFallbackHandler(http.server.SimpleHTTPRequestHandler):
    server_version = "RandomLifeDev/1.0"

    def end_headers(self):
        # Never cache during development so edits show up immediately.
        if self.path.split("?", 1)[0].split("#", 1)[0].endswith(
            (".html", ".js", ".css", ".webmanifest")
        ) or self.path.startswith("/life/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _maybe_rewrite_to_index(self):
        raw_path = self.path.split("?", 1)[0].split("#", 1)[0]
        if not (raw_path == "/life" or raw_path.startswith("/life/")):
            return
        fs_path = os.path.join(os.getcwd(), raw_path.lstrip("/"))
        if not os.path.isfile(fs_path):
            query = self.path[len(raw_path):]
            self.path = "/index.html" + query

    def do_GET(self):
        self._maybe_rewrite_to_index()
        return super().do_GET()

    def do_HEAD(self):
        self._maybe_rewrite_to_index()
        return super().do_HEAD()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main(argv):
    port = int(argv[1]) if len(argv) > 1 else 8000
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), SpaFallbackHandler) as httpd:
        print("Random Life dev server: http://localhost:%d/ (Ctrl+C to stop)" % port)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main(sys.argv)
