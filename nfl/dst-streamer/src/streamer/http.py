import time
from collections.abc import Callable
from typing import Any

import requests

TRIES = 4


def retry[T](
    fn: Callable[[], T],
    is_transient: Callable[[Exception], bool],
    *,
    what: str,
    sleep: Callable[[float], None] | None = None,
) -> T:
    """Call fn, retrying transient errors with exponential backoff (1s, 2s, 4s)."""
    for attempt in range(TRIES):
        try:
            return fn()
        except Exception as e:
            if not is_transient(e) or attempt == TRIES - 1:
                raise RuntimeError(f"{what} failed after {attempt + 1} tries: {e}") from e
            (sleep or time.sleep)(2**attempt)
    raise AssertionError("unreachable")


class TransientHTTPError(Exception):
    pass


def get_json(url: str, *, session: Any = requests, sleep: Callable[[float], None] | None = None):
    """GET JSON. Retries 429, 5xx and network errors; any other non-2xx fails at once."""

    def attempt():
        try:
            res = session.get(url, timeout=30)
        except requests.RequestException as e:
            raise TransientHTTPError(str(e)) from e
        if res.status_code == 429 or res.status_code >= 500:
            raise TransientHTTPError(f"HTTP {res.status_code}")
        res.raise_for_status()
        return res.json()

    return retry(
        attempt, lambda e: isinstance(e, TransientHTTPError), what=f"GET {url}", sleep=sleep
    )
