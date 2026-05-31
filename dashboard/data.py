"""Data source facade.

Uses the real SQLite honeypot database when it is present (``honeywatch.db`` in
the project root, or ``HONEYWATCH_DB``); otherwise falls back to bundled mock
data so the dashboard still renders during development.
"""
from __future__ import annotations

import logging

from . import db, mock_data

log = logging.getLogger("honeywatch")

_FUNCS = (
    "get_summary",
    "get_top_countries",
    "get_geo",
    "get_timeline",
    "get_event_types",
    "get_top_usernames",
    "get_top_passwords",
    "get_heatmap",
    "get_recent",
)


def using_real_db() -> bool:
    return db.available()


def _dispatch(name: str, *args, **kwargs):
    if db.available():
        try:
            return getattr(db, name)(*args, **kwargs)
        except Exception:  # pragma: no cover - defensive
            log.exception("DB query %s failed; falling back to mock", name)
    return getattr(mock_data, name)(*args, **kwargs)


def __getattr__(name: str):
    if name in _FUNCS:
        return lambda *a, **k: _dispatch(name, *a, **k)
    raise AttributeError(name)
