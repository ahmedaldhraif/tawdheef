"""Serve the exact native studio frame exporter; never approximate its motion."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import argparse,webbrowser
root=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=4044)
parser.add_argument('--open',action='store_true')
parser.add_argument('--save',action='store_true',help='Allow the export page to save only its four hero assets locally.')
args=parser.parse_args()
class HeroHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        allowed={f'wordmark-{theme}.{extension}' for theme in ['light','dark'] for extension in ['gif','png']}
        name=self.path.removeprefix('/__hero-export/')
        origin=f'http://127.0.0.1:{args.port}'
        if not args.save or not self.path.startswith('/__hero-export/') or name not in allowed or self.headers.get('Origin')!=origin or self.headers.get('X-Native-Hero')!='save':
            self.send_error(403);return
        length=int(self.headers.get('Content-Length','0'))
        if not 1000<=length<=10_000_000:
            self.send_error(400);return
        data=self.rfile.read(length)
        valid=(data.startswith(b'GIF89a') and data.endswith(b';')) if name.endswith('.gif') else (data.startswith(b'\x89PNG\r\n\x1a\n') and data.endswith(b'IEND\xaeB`\x82'))
        target=root/'public'/'brand'/'github-hero'/name
        if not valid or target.is_symlink():
            self.send_error(400);return
        temporary=target.with_suffix(target.suffix+'.tmp')
        if temporary.exists():
            self.send_error(409);return
        with temporary.open('xb') as output:output.write(data)
        temporary.replace(target)
        self.send_response(200);self.send_header('Content-Type','text/plain');self.end_headers();self.wfile.write(b'Saved')
server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(HeroHandler,directory=str(root/'public')))
url=f'http://127.0.0.1:{args.port}/brand/github-hero/render.html'
print('Native GitHub hero exporter: '+url,flush=True)
print('Build native hero, then save its four downloads into public/brand/github-hero/.',flush=True)
if args.save:print('Local Save to repository enabled for the four hero assets only.',flush=True)
if args.open:webbrowser.open(url)
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:server.server_close()
