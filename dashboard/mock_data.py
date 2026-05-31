"""Mock data for the HoneyWatch dashboard.

The shapes returned here intentionally mirror what the real parser + SQLite/
Postgres queries will eventually produce, so swapping these functions for live
database queries is a drop-in change. Numbers are seeded to match the design
mockup.
"""
from __future__ import annotations

import math
import random

# Deterministic-ish randomness so the dashboard looks stable across reloads.
_RNG = random.Random(1337)


def get_summary() -> dict:
    """Top KPI cards: value + 24h percentage delta."""
    return {
        "total_attacks": {"value": 15892, "delta_24h": 12.4},
        "unique_ips": {"value": 2314, "delta_24h": 8.7},
        "login_attempts": {"value": 9876, "delta_24h": 15.3},
        "countries": {"value": 107, "delta_24h": 5.1},
    }


def get_top_countries() -> list[dict]:
    """Top attack source countries (sidebar list next to the map)."""
    return [
        {"name": "China", "code": "CN", "flag": "\U0001F1E8\U0001F1F3", "count": 4523},
        {"name": "United States", "code": "US", "flag": "\U0001F1FA\U0001F1F8", "count": 2654},
        {"name": "Russia", "code": "RU", "flag": "\U0001F1F7\U0001F1FA", "count": 1253},
        {"name": "Brazil", "code": "BR", "flag": "\U0001F1E7\U0001F1F7", "count": 821},
        {"name": "Germany", "code": "DE", "flag": "\U0001F1E9\U0001F1EA", "count": 512},
        {"name": "India", "code": "IN", "flag": "\U0001F1EE\U0001F1F3", "count": 498},
        {"name": "Netherlands", "code": "NL", "flag": "\U0001F1F3\U0001F1F1", "count": 394},
        {"name": "France", "code": "FR", "flag": "\U0001F1EB\U0001F1F7", "count": 311},
        {"name": "United Kingdom", "code": "GB", "flag": "\U0001F1EC\U0001F1E7", "count": 277},
        {"name": "Other", "code": "XX", "flag": "\U0001F30D", "count": 3447},
    ]


# Approximate capital/centroid coordinates for the map markers.
_GEO = [
    {"name": "China", "code": "CN", "lat": 39.9, "lng": 116.4, "count": 4523},
    {"name": "United States", "code": "US", "lat": 38.9, "lng": -77.0, "count": 2654},
    {"name": "Russia", "code": "RU", "lat": 55.75, "lng": 37.6, "count": 1253},
    {"name": "Brazil", "code": "BR", "lat": -15.8, "lng": -47.9, "count": 821},
    {"name": "Germany", "code": "DE", "lat": 52.5, "lng": 13.4, "count": 512},
    {"name": "India", "code": "IN", "lat": 28.6, "lng": 77.2, "count": 498},
    {"name": "Netherlands", "code": "NL", "lat": 52.4, "lng": 4.9, "count": 394},
    {"name": "France", "code": "FR", "lat": 48.85, "lng": 2.35, "count": 311},
    {"name": "United Kingdom", "code": "GB", "lat": 51.5, "lng": -0.13, "count": 277},
    {"name": "Singapore", "code": "SG", "lat": 1.35, "lng": 103.8, "count": 240},
    {"name": "South Korea", "code": "KR", "lat": 37.57, "lng": 126.98, "count": 221},
    {"name": "Vietnam", "code": "VN", "lat": 21.03, "lng": 105.85, "count": 205},
    {"name": "Indonesia", "code": "ID", "lat": -6.2, "lng": 106.85, "count": 198},
    {"name": "Ukraine", "code": "UA", "lat": 50.45, "lng": 30.52, "count": 176},
    {"name": "Canada", "code": "CA", "lat": 45.42, "lng": -75.7, "count": 162},
]


def get_geo() -> list[dict]:
    """Attack source points for the interactive map."""
    return _GEO


def get_timeline() -> list[dict]:
    """Attacks over time for the last 24 hours (one bucket per hour)."""
    points = []
    for hour in range(25):
        # Smooth wave with some jitter, peaking in the afternoon.
        base = 900 + 600 * math.sin((hour / 24) * math.pi * 2 - 1.2)
        jitter = _RNG.randint(-120, 160)
        value = max(150, int(base + jitter))
        label = f"{hour % 24:02d}:00"
        points.append({"label": label, "value": value})
    return points


def get_event_types() -> list[dict]:
    """Attack type breakdown for the donut chart."""
    return [
        {"label": "SSH Brute Force", "value": 60.1, "color": "#f59e0b"},
        {"label": "Telnet Brute Force", "value": 15.7, "color": "#ea7c1f"},
        {"label": "Port Scanning", "value": 12.3, "color": "#c2410c"},
        {"label": "Command Injection", "value": 6.8, "color": "#7c2d12"},
        {"label": "Other", "value": 5.1, "color": "#3b82f6"},
    ]


def get_top_usernames() -> list[dict]:
    return [
        {"label": "admin", "value": 2438},
        {"label": "root", "value": 1987},
        {"label": "user", "value": 1125},
        {"label": "test", "value": 873},
        {"label": "guest", "value": 642},
        {"label": "support", "value": 512},
        {"label": "service", "value": 398},
        {"label": "ubuntu", "value": 311},
    ]


def get_top_passwords() -> list[dict]:
    return [
        {"label": "123456", "value": 2231},
        {"label": "admin", "value": 1672},
        {"label": "12345678", "value": 1321},
        {"label": "password", "value": 1102},
        {"label": "1234", "value": 872},
        {"label": "abc123", "value": 542},
        {"label": "qwerty", "value": 421},
        {"label": "iloveyou", "value": 311},
    ]


def get_heatmap() -> dict:
    """Attacks by hour-of-day x day-of-week."""
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    cells = []
    for d in range(7):
        for h in range(24):
            base = 50 + 40 * math.sin((h / 24) * math.pi * 2 - 1.0)
            weekend = 0.7 if d >= 5 else 1.0
            value = max(0, int((base + _RNG.randint(-25, 45)) * weekend))
            cells.append({"day": d, "hour": h, "value": value})
    return {"days": days, "cells": cells}


_ATTACK_TYPES = [
    "SSH Brute Force",
    "Port Scanning",
    "Telnet Brute Force",
    "Command Injection",
]

_RECENT = [
    {"ip": "103.45.12.33", "flag": "\U0001F1E8\U0001F1F3", "type": "SSH Brute Force", "time": "10:24:31"},
    {"ip": "185.199.108.25", "flag": "\U0001F1F7\U0001F1FA", "type": "Port Scanning", "time": "10:24:12"},
    {"ip": "45.142.234.11", "flag": "\U0001F1E9\U0001F1EA", "type": "Telnet Brute Force", "time": "10:23:51"},
    {"ip": "193.123.244.5", "flag": "\U0001F1FA\U0001F1F8", "type": "SSH Brute Force", "time": "10:23:18"},
    {"ip": "5.189.133.7", "flag": "\U0001F1F3\U0001F1F1", "type": "Command Injection", "time": "10:22:57"},
    {"ip": "61.177.172.19", "flag": "\U0001F1E8\U0001F1F3", "type": "SSH Brute Force", "time": "10:22:33"},
    {"ip": "212.70.149.84", "flag": "\U0001F1F7\U0001F1FA", "type": "Port Scanning", "time": "10:22:09"},
    {"ip": "159.65.220.41", "flag": "\U0001F1FA\U0001F1F8", "type": "Telnet Brute Force", "time": "10:21:44"},
]


def get_recent() -> list[dict]:
    return _RECENT
