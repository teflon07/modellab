"""Static file + session API for Harbor & Pine. Do not edit."""
from __future__ import annotations

import json
import pathlib
import secrets
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent
SITE = ROOT / "site"
USERS = {u["email"]: u for u in json.loads((ROOT / "data" / "users.json").read_text())}
PRIVATE = json.loads((ROOT / "data" / "private.json").read_text())
SESSIONS: dict[str, str] = {}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        pass

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _session(self) -> str | None:
        cookie = self.headers.get("Cookie", "")
        for part in cookie.split(";"):
            k, _, v = part.strip().partition("=")
            if k == "session":
                return SESSIONS.get(v)
        return None

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode() or "{}")
        except json.JSONDecodeError:
            return self._json(400, {"error": "bad json"})
        if self.path == "/api/login":
            user = USERS.get(str(data.get("email", "")))
            if not user or user["password"] != data.get("password"):
                return self._json(401, {"error": "invalid"})
            token = secrets.token_hex(16)
            SESSIONS[token] = user["email"]
            body = json.dumps({"name": user["name"], "role": user["role"]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Set-Cookie", f"session={token}; Path=/; HttpOnly")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/api/logout":
            self.send_response(200)
            self.send_header("Set-Cookie", "session=; Path=/; Max-Age=0")
            self.send_header("Content-Length", "2")
            self.end_headers()
            self.wfile.write(b"{}")
            return
        self._json(404, {"error": "not found"})

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/me":
            email = self._session()
            if not email:
                return self._json(401, {"error": "auth"})
            user = USERS[email]
            return self._json(200, {"name": user["name"], "role": user["role"]})
        if self.path == "/api/private":
            if not self._session():
                return self._json(401, {"error": "auth"})
            return self._json(200, PRIVATE)
        return super().do_GET()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
