from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from datetime import datetime
from urllib.parse import urlsplit
import webbrowser
from threading import Timer
import os

os.chdir(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

reload_count = 0
class Handler(SimpleHTTPRequestHandler):

    def do_GET(self):
        global reload_count

        if urlsplit(self.path).path in ("/", "/index.html"):
            reload_count += 1

            label = "START" if reload_count == 1 else f"RELOAD {reload_count - 1}"

            print(
                f"\n{'=' * 50}\n"
                f"{label}  |  {datetime.now():%d-%m-%Y %H:%M:%S}\n"
                f"{'=' * 50}",
                flush=True
            )

        super().do_GET()

    def log_message(self, format, *args):
        super().log_message(format, *args)

port = 8000
server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
url = f"http://localhost:{port}"
print(f"Server berjalan di {url}", flush=True)
Timer(1, lambda: webbrowser.open(url)).start()
server.serve_forever()