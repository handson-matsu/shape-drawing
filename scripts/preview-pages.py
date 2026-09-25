#!/usr/bin/env python3
"""Serve this repository under /shape-drawing/ like GitHub project Pages.
Development only; not required or run by GitHub Pages.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
PREFIX = '/shape-drawing/'

class PagesHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript'}

    def translate_path(self, path):
        # SimpleHTTPRequestHandler normalizes traversal within ROOT.
        if path.startswith(PREFIX):
            path = '/' + path[len(PREFIX):]
        return super().translate_path(path)

    def do_GET(self):
        self.serve(super().do_GET)

    def do_HEAD(self):
        self.serve(super().do_HEAD)

    def serve(self, method):
        path = urlsplit(self.path).path
        if path == PREFIX[:-1]:
            self.send_response(301)
            self.send_header('Location', PREFIX)
            self.end_headers()
        elif not path.startswith(PREFIX):
            self.send_error(404, 'Use ' + PREFIX)
        else:
            method()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4187)
    args = parser.parse_args()
    handler = partial(PagesHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    print(f'Preview: http://127.0.0.1:{args.port}{PREFIX}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
