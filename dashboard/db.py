"""SQLite data access for the HoneyWatch dashboard.

Reads from the honeypot database produced by the VPS parser. Schema:

    attacks(id, timestamp, src_ip, src_port, username, password,
            success, event_type, source)
    commands(id, attack_id, timestamp, src_ip, command)
    http_attacks(id, attack_id, timestamp, src_ip, method, path, attack_type)

event_type: connect | login_failed | login_success | command
source:     cowrie | dionaea | glastopf

The DB path defaults to ``honeywatch.db`` in the project root and can be
overridden with the ``HONEYWATCH_DB`` environment variable. Download it with:

    scp -P 2223 root@91.228.196.200:/opt/honeywatch/honeywatch.db ./honeywatch.db
"""
from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timedelta, timezone

from . import geoip

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)


def _resolve_db_path() -> str:
    """Locate the honeypot DB: env var, then project root, then Desktop."""
    env = os.environ.get("HONEYWATCH_DB")
    if env:
        return env
    candidates = [
        os.path.join(_ROOT, "honeywatch.db"),
        os.path.join(os.path.expanduser("~"), "Desktop", "honeywatch.db"),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return candidates[0]


DB_PATH = _resolve_db_path()

# Friendly labels + donut colours for each event type.
_EVENT_LABELS = {
    "connect": ("Port Scanning", "#c2410c"),
    "login_failed": ("Failed Login", "#f59e0b"),
    "login_success": ("Successful Login", "#ea7c1f"),
    "command": ("Command Execution", "#7c2d12"),
}
_DEFAULT_EVENT = ("Other", "#3b82f6")

_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def available() -> bool:
    return os.path.exists(DB_PATH)


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _ts_mod(conn: sqlite3.Connection) -> str:
    """Detect whether timestamps are epoch numbers or ISO/text.

    Returns the modifier to feed SQLite datetime()/strftime() (",'unixepoch'"
    for numeric epochs, "" for ISO-8601 / text timestamps).
    """
    row = conn.execute(
        "SELECT timestamp FROM attacks WHERE timestamp IS NOT NULL LIMIT 1"
    ).fetchone()
    if row is None:
        return ""
    val = row[0]
    if isinstance(val, (int, float)):
        return ",'unixepoch'"
    if isinstance(val, str) and val.strip().isdigit():
        return ",'unixepoch'"
    return ""


def _delta(conn: sqlite3.Connection, mod: str, where: str = "") -> tuple[int, float]:
    """Count rows in the last 24h and the % change vs the previous 24h."""
    clause = f" AND {where}" if where else ""
    last = conn.execute(
        f"SELECT COUNT(*) FROM attacks "
        f"WHERE datetime(timestamp{mod}) >= datetime('now','-1 day'){clause}"
    ).fetchone()[0]
    prev = conn.execute(
        f"SELECT COUNT(*) FROM attacks "
        f"WHERE datetime(timestamp{mod}) >= datetime('now','-2 day') "
        f"AND datetime(timestamp{mod}) < datetime('now','-1 day'){clause}"
    ).fetchone()[0]
    if prev:
        pct = round((last - prev) / prev * 100, 1)
    else:
        pct = 100.0 if last else 0.0
    return last, pct


def _ip_counts(conn: sqlite3.Connection) -> list[tuple[str, int]]:
    rows = conn.execute(
        "SELECT src_ip, COUNT(*) AS c FROM attacks "
        "WHERE src_ip IS NOT NULL GROUP BY src_ip"
    ).fetchall()
    return [(r["src_ip"], r["c"]) for r in rows]


def _country_aggregate(conn: sqlite3.Connection) -> list[dict]:
    """Aggregate attack counts by geolocated country."""
    ip_counts = _ip_counts(conn)
    geo = geoip.locate([ip for ip, _ in ip_counts])
    agg: dict[str, dict] = {}
    for ip, count in ip_counts:
        info = geo.get(ip)
        if not info:
            continue
        code = info["country_code"]
        entry = agg.setdefault(
            code,
            {
                "name": info["country"],
                "code": code,
                "flag": geoip.flag(code),
                "lat": info["lat"],
                "lng": info["lng"],
                "count": 0,
            },
        )
        entry["count"] += count
    return sorted(agg.values(), key=lambda e: e["count"], reverse=True)


# --------------------------------------------------------------------------- #
# Public API (mirrors mock_data signatures)                                   #
# --------------------------------------------------------------------------- #
def get_summary() -> dict:
    with _connect() as conn:
        mod = _ts_mod(conn)
        total, total_d = _delta(conn, mod)
        logins, logins_d = _delta(
            conn, mod, "event_type IN ('login_failed','login_success')"
        )
        unique_ips = conn.execute(
            "SELECT COUNT(DISTINCT src_ip) FROM attacks"
        ).fetchone()[0]
        # Unique IP 24h delta.
        uniq_last = conn.execute(
            f"SELECT COUNT(DISTINCT src_ip) FROM attacks "
            f"WHERE datetime(timestamp{mod}) >= datetime('now','-1 day')"
        ).fetchone()[0]
        uniq_prev = conn.execute(
            f"SELECT COUNT(DISTINCT src_ip) FROM attacks "
            f"WHERE datetime(timestamp{mod}) >= datetime('now','-2 day') "
            f"AND datetime(timestamp{mod}) < datetime('now','-1 day')"
        ).fetchone()[0]
        uniq_d = (
            round((uniq_last - uniq_prev) / uniq_prev * 100, 1)
            if uniq_prev
            else (100.0 if uniq_last else 0.0)
        )
        countries = len(_country_aggregate(conn))

    return {
        "total_attacks": {"value": total, "delta_24h": total_d},
        "unique_ips": {"value": unique_ips, "delta_24h": uniq_d},
        "login_attempts": {"value": logins, "delta_24h": logins_d},
        "countries": {"value": countries, "delta_24h": 0.0},
    }


def get_top_countries(limit: int = 10) -> list[dict]:
    with _connect() as conn:
        agg = _country_aggregate(conn)
    top = agg[:limit]
    other = sum(e["count"] for e in agg[limit:])
    rows = [
        {"name": e["name"], "code": e["code"], "flag": e["flag"], "count": e["count"]}
        for e in top
    ]
    if other:
        rows.append(
            {"name": "Other", "code": "XX", "flag": "\U0001F30D", "count": other}
        )
    return rows


def get_geo() -> list[dict]:
    with _connect() as conn:
        agg = _country_aggregate(conn)
    return [
        {
            "name": e["name"],
            "code": e["code"],
            "lat": e["lat"],
            "lng": e["lng"],
            "count": e["count"],
        }
        for e in agg
        if e.get("lat") is not None and e.get("lng") is not None
    ]


def get_timeline(hours: int = 24) -> list[dict]:
    """Attacks per hour over the most recent ``hours`` window.

    The window is anchored to the latest event in the database (never earlier
    than the real clock), so events whose timestamps run ahead of the server
    clock (VPS timezone skew) are still shown instead of dropping to zero.
    """
    with _connect() as conn:
        mod = _ts_mod(conn)
        max_ts = conn.execute(
            f"SELECT MAX(datetime(timestamp{mod})) FROM attacks"
        ).fetchone()[0]

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        anchor = now
        if max_ts:
            try:
                anchor = max(now, datetime.strptime(max_ts, "%Y-%m-%d %H:%M:%S"))
            except ValueError:
                pass
        anchor = anchor.replace(minute=0, second=0, microsecond=0)
        start = anchor - timedelta(hours=hours - 1)
        start_key = start.strftime("%Y-%m-%d %H:00")

        rows = conn.execute(
            f"SELECT strftime('%Y-%m-%d %H:00', timestamp{mod}) AS bucket, "
            f"COUNT(*) AS c FROM attacks "
            f"WHERE strftime('%Y-%m-%d %H:00', timestamp{mod}) >= ? "
            f"GROUP BY bucket",
            (start_key,),
        ).fetchall()
        counts = {r["bucket"]: r["c"] for r in rows}

    out = []
    for i in range(hours):
        b = start + timedelta(hours=i)
        key = b.strftime("%Y-%m-%d %H:00")
        out.append({"label": b.strftime("%H:00"), "value": counts.get(key, 0)})
    return out


def get_event_types() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT event_type, COUNT(*) AS c FROM attacks GROUP BY event_type"
        ).fetchall()
    total = sum(r["c"] for r in rows) or 1
    out = []
    for r in rows:
        label, color = _EVENT_LABELS.get(r["event_type"], _DEFAULT_EVENT)
        out.append(
            {
                "label": label,
                "value": round(r["c"] / total * 100, 1),
                "count": r["c"],
                "color": color,
            }
        )
    return sorted(out, key=lambda e: e["value"], reverse=True)


def _top_field(field: str, limit: int) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT {field} AS label, COUNT(*) AS c FROM attacks "
            f"WHERE {field} IS NOT NULL AND {field} <> '' "
            f"GROUP BY {field} ORDER BY c DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [{"label": r["label"], "value": r["c"]} for r in rows]


def get_top_usernames(limit: int = 8) -> list[dict]:
    return _top_field("username", limit)


def get_top_passwords(limit: int = 8) -> list[dict]:
    return _top_field("password", limit)


def get_heatmap() -> dict:
    """Attacks by day-of-week x hour-of-day across all data."""
    with _connect() as conn:
        mod = _ts_mod(conn)
        rows = conn.execute(
            f"SELECT CAST(strftime('%w', timestamp{mod}) AS INTEGER) AS dow, "
            f"CAST(strftime('%H', timestamp{mod}) AS INTEGER) AS hour, "
            f"COUNT(*) AS c FROM attacks GROUP BY dow, hour"
        ).fetchall()
    # strftime %w: 0=Sunday..6=Saturday -> remap to Mon..Sun index.
    remap = {0: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5}
    cells = []
    grid = {(d, h): 0 for d in range(7) for h in range(24)}
    for r in rows:
        di = remap.get(r["dow"], 0)
        grid[(di, r["hour"])] = r["c"]
    for (d, h), v in grid.items():
        cells.append({"day": d, "hour": h, "value": v})
    return {"days": _DAYS, "cells": cells}


def get_recent(limit: int = 8) -> list[dict]:
    with _connect() as conn:
        mod = _ts_mod(conn)
        rows = conn.execute(
            f"SELECT src_ip, event_type, "
            f"strftime('%H:%M:%S', timestamp{mod}) AS t "
            f"FROM attacks ORDER BY datetime(timestamp{mod}) DESC LIMIT ?",
            (limit,),
        ).fetchall()
        geo = geoip.locate([r["src_ip"] for r in rows])
    out = []
    for r in rows:
        info = geo.get(r["src_ip"])
        code = info["country_code"] if info else None
        label = _EVENT_LABELS.get(r["event_type"], _DEFAULT_EVENT)[0]
        out.append(
            {
                "ip": r["src_ip"],
                "flag": geoip.flag(code),
                "type": label,
                "time": r["t"] or "",
            }
        )
    return out
