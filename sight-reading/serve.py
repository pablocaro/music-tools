import http.server, socketserver, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = 8091

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    print("serving sight-reading (no-cache) on http://localhost:%d/" % PORT)
    httpd.serve_forever()
