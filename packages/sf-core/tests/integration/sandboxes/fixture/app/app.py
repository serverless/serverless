import json, os, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOOKS_PREFIX = "/aws/lambda-microvms/runtime/v1"


class AppHandler(BaseHTTPRequestHandler):
    """Echo server on :8080 — returns request details + GREETING env as JSON."""

    protocol_version = "HTTP/1.1"

    def _handle(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n).decode("utf-8", "replace") if n else ""
        payload = {
            "request_line": self.requestline,
            "method": self.command,
            "path": self.path,
            "headers": dict(self.headers.items()),
            "body": body,
            "GREETING": os.environ.get("GREETING", "<unset>"),
        }
        out = json.dumps(payload).encode()
        print("APP_REQUEST " + json.dumps(payload), flush=True)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    do_GET = do_POST = do_PUT = do_DELETE = do_PATCH = _handle

    def log_message(self, *args):
        pass


class HooksHandler(BaseHTTPRequestHandler):
    """Hooks server on :9000 — handles POST /aws/lambda-microvms/runtime/v1/{ready,run,...}."""

    protocol_version = "HTTP/1.1"

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n).decode("utf-8", "replace") if n else ""
        hook_name = self.path.rsplit("/", 1)[-1]
        print(f"HOOK {hook_name} path={self.path} body={body}", flush=True)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"{}")

    def log_message(self, *args):
        pass


def _serve(port, handler_class, label):
    print(f"BOOT {label} 0.0.0.0:{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), handler_class).serve_forever()


if __name__ == "__main__":
    threading.Thread(
        target=_serve, args=(9000, HooksHandler, "hooks"), daemon=True
    ).start()
    _serve(8080, AppHandler, "app")
