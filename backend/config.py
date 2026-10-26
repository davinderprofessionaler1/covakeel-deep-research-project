"""Environment-backed application configuration."""

from dataclasses import dataclass
import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _integer(name: str, default: int, minimum: int, maximum: int) -> int:
    value = int(os.getenv(name, str(default)))
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


def _boolean(name: str, default: bool = False) -> bool:
    value = os.getenv(name, "true" if default else "false").strip().casefold()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be true or false")


@dataclass(frozen=True)
class Settings:
    project_root: Path
    host: str
    port: int
    provider: str
    ollama_url: str
    ollama_model: str
    ollama_keep_alive: str
    context_tokens: int
    max_output_tokens: int
    max_messages: int
    max_message_chars: int
    knowledge_index: Path
    allow_pending_knowledge: bool
    knowledge_max_context_chars: int

    @classmethod
    def load(cls) -> "Settings":
        _load_dotenv(PROJECT_ROOT / ".env")
        return cls(
            project_root=PROJECT_ROOT,
            host=os.getenv("COVAKEEL_HOST", "0.0.0.0"),
            port=_integer("COVAKEEL_PORT", 8080, 1024, 65535),
            provider=os.getenv("AI_PROVIDER", "ollama").lower(),
            ollama_url=os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/"),
            ollama_model=os.getenv("OLLAMA_MODEL", "covakeel-local:latest"),
            ollama_keep_alive=os.getenv("OLLAMA_KEEP_ALIVE", "30m"),
            context_tokens=_integer("AI_CONTEXT_TOKENS", 4096, 512, 131072),
            max_output_tokens=_integer("AI_MAX_OUTPUT_TOKENS", 160, 32, 8192),
            max_messages=_integer("AI_MAX_MESSAGES", 20, 1, 100),
            max_message_chars=_integer("AI_MAX_MESSAGE_CHARS", 12000, 100, 100000),
            knowledge_index=Path(
                os.getenv(
                    "COVAKEEL_KNOWLEDGE_INDEX",
                    str(PROJECT_ROOT / "knowledge" / "approved" / "chunks.jsonl"),
                )
            ).expanduser(),
            allow_pending_knowledge=_boolean("COVAKEEL_ALLOW_PENDING_KNOWLEDGE", False),
            knowledge_max_context_chars=_integer(
                "COVAKEEL_KNOWLEDGE_MAX_CONTEXT_CHARS", 5000, 500, 20000
            ),
        )

