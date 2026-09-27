"""Upserts into the app's Supabase through its REST API (PostgREST), with the service role key."""

import os
from pathlib import Path

import requests

from streamer.http import TransientHTTPError, retry

ENV_FILE = Path(__file__).resolve().parents[4] / ".env.local"


def credentials() -> tuple[str, str]:
    """Env vars first (CI secrets), then the app's .env.local (local dev)."""
    env = dict(os.environ)
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            key, sep, value = line.partition("=")
            if sep and not line.lstrip().startswith("#"):
                env.setdefault(key.strip(), value.strip().strip('"'))
    url, key = env.get("NEXT_PUBLIC_SUPABASE_URL"), env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to publish")
    return url, key


def upsert(table: str, rows: list[dict] | dict, on_conflict: str, session=requests) -> None:
    """Insert or update by the conflict columns. Retries 429/5xx and network errors; any other
    failure (bad key, missing table) raises at once with Supabase's message."""
    url, key = credentials()

    def attempt():
        try:
            res = session.post(
                f"{url}/rest/v1/{table}?on_conflict={on_conflict}",
                json=rows,
                headers={
                    "apikey": key,
                    "Authorization": f"Bearer {key}",
                    "Prefer": "resolution=merge-duplicates,return=minimal",
                },
                timeout=30,
            )
        except requests.RequestException as e:
            raise TransientHTTPError(str(e)) from e
        if res.status_code == 429 or res.status_code >= 500:
            raise TransientHTTPError(f"HTTP {res.status_code} {res.text[:300]}")
        if res.status_code >= 300:
            raise RuntimeError(f"HTTP {res.status_code} {res.text[:300]}")

    retry(attempt, lambda e: isinstance(e, TransientHTTPError), what=f"Supabase upsert {table}")
