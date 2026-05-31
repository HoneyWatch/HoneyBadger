"""IP geolocation with a persistent on-disk cache.

Resolves source IP addresses to country / latitude / longitude using the free
ip-api.com batch endpoint. Results are cached in ``data/geo_cache.json`` so we
only hit the network once per unique IP (ip-api free tier is rate limited).
"""
from __future__ import annotations

import ipaddress
import json
import os
import urllib.request

_HERE = os.path.dirname(os.path.abspath(__file__))
_DATA_DIR = os.path.join(os.path.dirname(_HERE), "data")
_CACHE_PATH = os.path.join(_DATA_DIR, "geo_cache.json")

_BATCH_URL = "http://ip-api.com/batch"
_FIELDS = "status,country,countryCode,lat,lon,query"
_BATCH_SIZE = 100

_cache: dict | None = None


def _load_cache() -> dict:
    global _cache
    if _cache is None:
        try:
            with open(_CACHE_PATH, "r", encoding="utf-8") as fh:
                _cache = json.load(fh)
        except (OSError, ValueError):
            _cache = {}
    return _cache


def _save_cache() -> None:
    if _cache is None:
        return
    os.makedirs(_DATA_DIR, exist_ok=True)
    try:
        with open(_CACHE_PATH, "w", encoding="utf-8") as fh:
            json.dump(_cache, fh)
    except OSError:
        pass


def flag(country_code: str | None) -> str:
    """Return a regional-indicator flag emoji for a 2-letter country code."""
    if not country_code or len(country_code) != 2 or not country_code.isalpha():
        return "\U0001F3F4"  # waving black flag fallback
    base = 0x1F1E6
    return "".join(chr(base + (ord(c) - ord("A"))) for c in country_code.upper())


def _is_public(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_global
    except ValueError:
        return False


def _fetch_batch(ips: list[str]) -> dict:
    """Query ip-api for a chunk of IPs. Returns ip -> geo dict."""
    payload = [{"query": ip, "fields": _FIELDS} for ip in ips]
    req = urllib.request.Request(
        _BATCH_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    out: dict = {}
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            results = json.load(resp)
    except Exception:
        return out
    for item in results:
        ip = item.get("query")
        if not ip:
            continue
        if item.get("status") == "success":
            out[ip] = {
                "country": item.get("country") or "Unknown",
                "country_code": item.get("countryCode") or "",
                "lat": item.get("lat"),
                "lng": item.get("lon"),
            }
        else:
            out[ip] = None  # mark as resolved-but-unknown so we don't retry
    return out


def locate(ips: list[str]) -> dict:
    """Resolve a list of IPs to geo info, using and updating the cache.

    Returns a mapping ``ip -> {country, country_code, lat, lng}`` (only for IPs
    that resolved successfully to a public location).
    """
    cache = _load_cache()
    unique = {ip for ip in ips if ip}
    missing = [ip for ip in unique if ip not in cache and _is_public(ip)]

    # Mark private / invalid IPs as unresolved in the cache.
    for ip in unique:
        if ip not in cache and not _is_public(ip):
            cache[ip] = None

    changed = bool([ip for ip in unique if ip not in _load_cache()])
    for start in range(0, len(missing), _BATCH_SIZE):
        chunk = missing[start : start + _BATCH_SIZE]
        cache.update(_fetch_batch(chunk))
        changed = True

    if changed or missing:
        _save_cache()

    return {ip: cache[ip] for ip in unique if cache.get(ip)}
