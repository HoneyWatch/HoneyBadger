"""HoneyWatch analytics dashboard (Flask).

Serves the overview page and a set of JSON endpoints. The endpoints currently
read from ``mock_data`` but are shaped to match the future parser/DB queries,
so wiring in the real database later only requires swapping the data source.
"""
from __future__ import annotations

from flask import Flask, jsonify, render_template

from . import data

app = Flask(__name__)


@app.route("/")
def overview():
    return render_template(
        "overview.html",
        summary=data.get_summary(),
        top_countries=data.get_top_countries(),
        recent=data.get_recent(),
        active_page="overview",
    )


@app.route("/api/summary")
def api_summary():
    return jsonify(data.get_summary())


@app.route("/api/countries")
def api_countries():
    return jsonify(data.get_top_countries())


@app.route("/api/geo")
def api_geo():
    return jsonify(data.get_geo())


@app.route("/api/timeline")
def api_timeline():
    return jsonify(data.get_timeline())


@app.route("/api/event-types")
def api_event_types():
    return jsonify(data.get_event_types())


@app.route("/api/top-usernames")
def api_top_usernames():
    return jsonify(data.get_top_usernames())


@app.route("/api/top-passwords")
def api_top_passwords():
    return jsonify(data.get_top_passwords())


@app.route("/api/heatmap")
def api_heatmap():
    return jsonify(data.get_heatmap())


@app.route("/api/recent")
def api_recent():
    return jsonify(data.get_recent())


def main() -> None:
    app.run(host="0.0.0.0", port=5000, debug=True)


if __name__ == "__main__":
    main()
