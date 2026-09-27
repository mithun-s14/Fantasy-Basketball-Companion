import pytest
import requests

from streamer.http import get_json, retry


class FakeResponse:
    def __init__(self, status, body=None):
        self.status_code, self._body = status, body

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}")


class FakeSession:
    def __init__(self, *responses):
        self.responses, self.calls = list(responses), 0

    def get(self, url, timeout):
        self.calls += 1
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def test_retries_429_5xx_and_network_errors_with_backoff():
    session = FakeSession(
        FakeResponse(429),
        requests.ConnectionError("reset"),
        FakeResponse(503),
        FakeResponse(200, {"ok": 1}),
    )
    delays = []
    assert get_json("u", session=session, sleep=delays.append) == {"ok": 1}
    assert delays == [1, 2, 4]


def test_client_error_fails_immediately():
    session = FakeSession(FakeResponse(404))
    with pytest.raises(RuntimeError, match="GET u failed after 1 tries"):
        get_json("u", session=session, sleep=lambda _: None)
    assert session.calls == 1


def test_gives_up_after_four_tries():
    session = FakeSession(*[FakeResponse(500)] * 4)
    with pytest.raises(RuntimeError, match="failed after 4 tries: HTTP 500"):
        get_json("u", session=session, sleep=lambda _: None)


def test_retry_only_retries_transient_errors():
    calls = []

    def boom():
        calls.append(1)
        raise ValueError("bad data")

    with pytest.raises(RuntimeError, match="x failed after 1 tries"):
        retry(boom, lambda e: isinstance(e, ConnectionError), what="x", sleep=lambda _: None)
    assert len(calls) == 1
