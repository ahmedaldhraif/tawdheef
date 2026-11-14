"""Serve the exact native studio frame exporter; never approximate its motion."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import argparse,webbrowser
root=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=4044)
parser.add_argument('--open',action='store_true')
args=parser.parse_args()
server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(SimpleHTTPRequestHandler,directory=str(root/'public')))
url=f'http://127.0.0.1:{args.port}/brand/github-hero/render.html'
print('Native GitHub hero exporter: '+url,flush=True)
print('Build native hero, then save its four downloads into public/brand/github-hero/.',flush=True)
if args.open:webbrowser.open(url)
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:server.server_close()
