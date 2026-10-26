"""Provider contracts shared by local and future cloud models."""

from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass


@dataclass(frozen=True)
class ChatMessage:
    role: str
    content: str


class AIProvider(ABC):
    @abstractmethod
    def health(self) -> dict:
        """Return provider health metadata or raise an availability error."""

    @abstractmethod
    def stream_chat(self, messages: list[ChatMessage]) -> Iterator[str]:
        """Yield user-visible answer chunks."""

