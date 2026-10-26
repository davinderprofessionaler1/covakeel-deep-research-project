"""Dependency-free local HTTP server for CoVakeel."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import socket
import time
from urllib.parse import urlparse

from backend.config import PROJECT_ROOT, Settings
from backend.legal_scope import REFUSAL_MESSAGE, is_legal_query
from backend.providers.base import ChatMessage
from backend.providers.ollama import OllamaError, OllamaProvider


WEB_ROOT = PROJECT_ROOT / "web"


def _provider(settings: Settings):
    if settings.provider == "ollama":
        return OllamaProvider(settings)
    raise ValueError(f"Unsupported AI_PROVIDER: {settings.provider}")


def _validate_messages(raw_messages, settings: Settings) -> list[ChatMessage]:
    if not isinstance(raw_messages, list) or not raw_messages:
        raise ValueError("At least one message is required")
    if len(raw_messages) > settings.max_messages:
        raise ValueError(f"A maximum of {settings.max_messages} messages is allowed")

    messages: list[ChatMessage] = []
    for item in raw_messages:
        if not isinstance(item, dict):
            raise ValueError("Each message must be an object")
        role = item.get("role")
        content = item.get("content")
        if role not in {"user", "assistant"}:
            raise ValueError("Message role must be user or assistant")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("Message content cannot be empty")
        if len(content) > settings.max_message_chars:
            raise ValueError(f"Each message must be under {settings.max_message_chars} characters")
        messages.append(ChatMessage(role=role, content=content.strip()))
    if messages[-1].role != "user":
        raise ValueError("The final message must be from the user")
    return messages


class CoVakeelHandler(SimpleHTTPRequestHandler):
    settings: Settings
    provider: OllamaProvider

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'")
        super().end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            self._health()
            return
        if path.startswith("/api/"):
            self._json(404, {"error": "API endpoint not found"})
            return
        super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/chat/stream":
            self._json(404, {"error": "API endpoint not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > 512_000:
                raise ValueError("Invalid request size")
            payload = json.loads(self.rfile.read(content_length))
            messages = _validate_messages(payload.get("messages"), self.settings)
        except (ValueError, json.JSONDecodeError) as error:
            self._json(400, {"error": str(error)})
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "close")
        self.end_headers()
        started = time.monotonic()

        try:
            knowledge_mode = self.provider.corpus.stats()["mode"]
            search_message = (
                "Searching Phase 1 test knowledge…"
                if knowledge_mode == "pending_test"
                else "Searching approved knowledge…"
            )
            self._event({"type": "status", "message": search_message})
            if not is_legal_query(messages[-1].content):
                self._event({"type": "token", "content": REFUSAL_MESSAGE})
                self._event({"type": "done", "elapsed_ms": round((time.monotonic() - started) * 1000)})
                return
            for chunk in self.provider.stream_chat(messages):
                self._event({"type": "token", "content": chunk})
            self._event({"type": "done", "elapsed_ms": round((time.monotonic() - started) * 1000)})
        except (OllamaError, ValueError) as error:
            self._event({"type": "error", "error": str(error)})
        except (BrokenPipeError, ConnectionResetError):
            return

    def _health(self):
        try:
            provider_health = self.provider.health()
            self._json(200, {"status": "ok", **provider_health})
        except OllamaError as error:
            self._json(503, {
                "status": "unavailable",
                "provider": self.settings.provider,
                "model": self.settings.ollama_model,
                "error": str(error),
            })

    def _event(self, data: dict):
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8") + b"\n")
        self.wfile.flush()

    def _json(self, status: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {self.address_string()} {format % args}")


def _lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as connection:
            connection.connect(("8.8.8.8", 80))
            return connection.getsockname()[0]
    except OSError:
        return "<this-computer-ip>"


def main() -> None:
    settings = Settings.load()
    CoVakeelHandler.settings = settings
    CoVakeelHandler.provider = _provider(settings)
    server = ThreadingHTTPServer((settings.host, settings.port), CoVakeelHandler)
    print(f"CoVakeel local: http://127.0.0.1:{settings.port}")
    if settings.host == "0.0.0.0":
        print(f"Same Wi-Fi:     http://{_lan_ip()}:{settings.port}")
    print(f"AI provider:    {settings.provider} / {settings.ollama_model}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping CoVakeel…")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

