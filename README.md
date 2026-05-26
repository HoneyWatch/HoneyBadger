# HoneyWatchApp

Honeypot with an intelligent analytics dashboard — an open-source system for monitoring real-world network attacks, collecting threat data, and visualizing it in near real time.

## Table of Contents

- [About the Project](#about-the-project)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Analytics Dashboard](#analytics-dashboard)
- [Repository Structure](#repository-structure)
- [Data Analysis and Research](#data-analysis-and-research)
- [Security](#security)
- [License](#license)
- [Authors and Contributing](#authors-and-contributing)

## About the Project

**HoneyWatchApp** is an educational and research project that combines production honeypot deployment on a VPS with a custom threat intelligence tool. The system records attack attempts against emulated network services, processes logs into structured data, and presents the results on an interactive dashboard.

Project goals:

- gain practical insight into techniques used by attackers,
- learn methods for detecting and logging security incidents,
- build a tool for collecting, processing, and visualizing threat data,
- release a complete solution as an open-source repository with installation documentation.

## Features

### Honeypot Infrastructure

- **Cowrie** deployment — SSH/Telnet service emulation with logging of login attempts and executed commands.
- **Dionaea** deployment — listening on additional network ports to detect scanning and exploitation attempts.
- Service isolation in **Docker** containers to protect the host system.
- Intentional exposure of services to internet traffic to capture real attack attempts.

### Data Collection and Processing Module

- **Python** log parser extracting:
  - login attempts (username, password, outcome),
  - commands entered by attackers,
  - port scan events,
  - session metadata (IP address, port, protocol, timestamp).
- **SQLite** or **PostgreSQL** database storing structured events.
- Integration with IP geolocation APIs (e.g. ip-api.com, ipinfo.io) to identify the country and region of attack sources.
- Continuous background parser operation with automatic persistence of new events.

### Analytics Dashboard

- Web application (**Flask** or **Streamlit**) with near real-time data refresh.
- Interactive world map showing attack sources.
- Charts and statistics:
  - most commonly used passwords and usernames,
  - countries of origin,
  - event types (login, commands, scanning),
  - activity over time (hours, days of the week).
- KPI panel: unique IP count, total login attempts, most active sources.

## System Architecture

```
                    Internet
                        |
                        v
              +-------------------+
              |   VPS (Linux)     |
              |                   |
              |  +-------------+  |
              |  |   Docker    |  |
              |  |             |  |
              |  |  Cowrie     |  |---- SSH/Telnet (22, 23, ...)
              |  |  Dionaea    |  |---- Other ports
              |  +------+------+  |
              |         |         |
              |         v         |
              |     Log files     |
              +---------+---------+
                          |
                          v
              +-------------------+
              |  Parser (Python)  |
              |  + geolocation    |
              +---------+---------+
                          |
                          v
              +-------------------+
              | SQLite / Postgres |
              +---------+---------+
                          |
                          v
              +-------------------+
              |    Dashboard      |
              |  Flask/Streamlit  |
              +-------------------+
```

Data flow:

1. An attacker connects to the honeypot emulating a network service.
2. Cowrie/Dionaea writes the event to a log file.
3. The parser monitors logs, parses new entries, and enriches them with geolocation data.
4. Structured data is stored in the database.
5. The dashboard reads the database and presents statistics and visualizations.

## Requirements

### VPS Server

- Operating system: **Linux** (Ubuntu 22.04 LTS or newer recommended)
- Minimum: 1 vCPU, 1 GB RAM, 10 GB disk
- Public IP address
- Open honeypot ports (e.g. 22, 23, and ports handled by Dionaea)

### Local Software (analytics server / development)

- **Python** 3.10+
- **Docker** and **Docker Compose**
- **Git**

Optional:

- **PostgreSQL** 14+ (instead of SQLite in production)
- API key for an IP geolocation service

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/HoneyWatchApp.git
cd HoneyWatchApp
```

### 2. Honeypots (Docker)

Start the Cowrie and Dionaea containers:

```bash
cd docker
docker compose up -d
```

Check status:

```bash
docker compose ps
docker compose logs -f cowrie
```

By default, Cowrie logs are written to `docker/cowrie/log/`, and Dionaea logs to `docker/dionaea/log/`.

### 3. Python Environment (parser and dashboard)

```bash
cd ..
python -m venv venv
source venv/bin/activate        # Linux/macOS
# venv\Scripts\activate         # Windows

pip install -r requirements.txt
```

### 4. Database

Initialize the schema (SQLite — default):

```bash
python -m parser.init_db
```

For PostgreSQL, set the `DATABASE_URL` variable in `.env` before initialization:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/honeywatch
```

### 5. Environment Configuration

Copy the example file and fill in the values:

```bash
cp .env.example .env
```

Example `.env` contents:

```env
# Honeypot log paths
COWRIE_LOG_PATH=./docker/cowrie/log/cowrie.json
DIONAEA_LOG_PATH=./docker/dionaea/log/

# Database
DATABASE_URL=sqlite:///./data/honeywatch.db

# IP geolocation
GEOIP_API_URL=https://ip-api.com/json/
GEOIP_RATE_LIMIT=45

# Dashboard
DASHBOARD_HOST=0.0.0.0
DASHBOARD_PORT=5000
DASHBOARD_SECRET_KEY=change-to-a-random-string
```

## Configuration

### Cowrie

Configuration file: `docker/cowrie/etc/cowrie.cfg`. Key options:

- `listen_endpoints` — listening ports (default 2222 in the container, mapped to port 22 on the host),
- `log_json = true` — JSON logs for easier parsing,
- `output_jsonlog` — log file path.

### Dionaea

Service and port configuration: `docker/dionaea/etc/dionaea.conf`. You can enable listening on selected protocols (FTP, HTTP, SMB, etc.) according to your security policy and research goals.

### Parser

The `parser/` module is responsible for:

- tailing/following log files,
- mapping raw entries to an event model,
- deduplication and normalization of IP addresses,
- writing to the database.

Manual start:

```bash
python -m parser.main
```

Run as a systemd service (Linux):

```bash
sudo cp deploy/honeywatch-parser.service /etc/systemd/system/
sudo systemctl enable --now honeywatch-parser
```

## Running the Application

### Parser (continuous log processing)

```bash
python -m parser.main
```

### Dashboard

**Flask:**

```bash
python -m dashboard.app
```

**Streamlit:**

```bash
streamlit run dashboard/streamlit_app.py
```

The dashboard is available by default at `http://localhost:5000` (Flask) or `http://localhost:8501` (Streamlit).

### Full Stack (Docker Compose)

```bash
docker compose -f docker/docker-compose.yml up -d
python -m parser.main &
python -m dashboard.app
```

## Analytics Dashboard

The dashboard includes:

| Section | Description |
|---------|-------------|
| **Summary** | Unique IPs, sessions, login attempts, events in the last 24 h |
| **World Map** | Geographic distribution of attack sources |
| **Top Passwords / Usernames** | Most popular combinations used by botnets |
| **Timeline** | Attack activity over time (hourly, daily) |
| **Event Types** | Breakdown by logins, commands, scanning |
| **Session Details** | List of recent events with filtering by IP, country, date |

Data is refreshed automatically at a configurable interval (default: every 30 seconds).

## Repository Structure

```
HoneyWatchApp/
├── docker/                 # Docker configuration (Cowrie, Dionaea)
│   ├── cowrie/
│   ├── dionaea/
│   └── docker-compose.yml
├── parser/                 # Log parsing module
│   ├── main.py
│   ├── cowrie_parser.py
│   ├── dionaea_parser.py
│   ├── geoip.py
│   ├── models.py
│   └── init_db.py
├── dashboard/              # Web application
│   ├── app.py              # Flask
│   ├── streamlit_app.py    # Streamlit (alternative)
│   ├── templates/
│   └── static/
├── data/                   # SQLite database (generated locally)
├── deploy/                 # systemd, nginx files
├── docs/                   # Additional documentation, reports
├── .env.example
├── requirements.txt
└── README.md
```

## Data Analysis and Research

The project includes a research component based on collected data:

- identifying attacker behavior patterns (command sequences, typical post-login paths),
- analysis of the most popular username/password combinations,
- characterization of botnet activity (frequency, geographic distribution),
- comparison of attack intensity at different times of day and days of the week,
- evaluation of honeypot configuration effectiveness (Cowrie vs Dionaea, open port set).

Analysis results are documented in the `docs/` directory (final report with conclusions and recommendations for defending against identified threats).

Example analytical queries (SQL):

```sql
-- Top 10 passwords
SELECT password, COUNT(*) AS cnt
FROM login_attempts
GROUP BY password
ORDER BY cnt DESC
LIMIT 10;

-- Attacks by country
SELECT country, COUNT(DISTINCT source_ip) AS unique_ips
FROM events
WHERE country IS NOT NULL
GROUP BY country
ORDER BY unique_ips DESC;

-- Activity by hour
SELECT strftime('%H', timestamp) AS hour, COUNT(*) AS events
FROM events
GROUP BY hour
ORDER BY hour;
```

## Security

A honeypot intentionally exposes services to the internet. Follow these guidelines:

1. **Isolation** — run Cowrie and Dionaea only in Docker containers, without access to sensitive host resources.
2. **Dedicated VPS** — do not install honeypots on production servers or machines holding personal data.
3. **Firewall** — limit inbound ports to the minimum required; block outbound honeypot traffic except DNS and geolocation, if possible.
4. **No real credentials** — the honeypot must not use passwords or SSH keys from other systems.
5. **Host monitoring** — regularly review VPS system logs for anomalies.
6. **Legal compliance** — ensure that collecting and storing IP address data complies with applicable regulations (GDPR) and your VPS provider's terms of service.
7. **Sensitive data** — do not commit `.env`, API keys, or raw logs containing real IP addresses to a public repository.

## License

This project is released under the [MIT](LICENSE) license — you may use, modify, and distribute it freely with attribution.

## Authors and Contributing

Contributions are welcome. To report a bug or suggest a feature:

1. Open an [Issue](https://github.com/<your-username>/HoneyWatchApp/issues) describing the problem or idea.
2. Fork the repository, make changes on a separate branch, and open a Pull Request.

Before submitting a PR, ensure that:

- code follows the project style,
- the parser correctly handles sample logs from `tests/fixtures/`,
- documentation in README or `docs/` is updated if you changed the interface or configuration.

---

**HoneyWatchApp** — honeypot, threat intelligence, and attack analytics in one open-source tool.
