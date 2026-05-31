/* HoneyWatch dashboard front-end. Fetches mock JSON from the Flask API and
   renders the interactive map, charts, and heatmap. */
(function () {
  "use strict";

  const COLORS = {
    accent: "#f59e0b",
    accentSoft: "rgba(245, 158, 11, 0.18)",
    red: "#dc2626",
    grid: "rgba(255,255,255,0.05)",
    tick: "#8a8a93",
  };

  const ISO2_TO_ISO3 = {
    CN: "CHN",
    US: "USA",
    RU: "RUS",
    BR: "BRA",
    DE: "DEU",
    IN: "IND",
    NL: "NLD",
    FR: "FRA",
    GB: "GBR",
    SG: "SGP",
    KR: "KOR",
    VN: "VNM",
    ID: "IDN",
    UA: "UKR",
    CA: "CAN",
  };

  const getJSON = (url) => fetch(url).then((r) => r.json());

  Chart.defaults.color = COLORS.tick;
  Chart.defaults.font.family = "Inter, Segoe UI, system-ui, sans-serif";
  Chart.defaults.font.size = 11;

  /* ---------- Map (static SVG world, per-country attack counts) ---------- */
  function setMapInfo(name, count) {
    const el = document.getElementById("map-info");
    if (!el) return;
    if (!name) {
      el.textContent = "Hover or click a country to see attack count";
      return;
    }
    const formatted = count.toLocaleString();
    el.innerHTML =
      `<strong>${name}</strong> — ` +
      `<span class="map-info-count">${formatted}</span> attack${count === 1 ? "" : "s"}`;
  }

  function initMap(points) {
    const container = document.getElementById("attack-map");
    if (!container || typeof d3 === "undefined") return;

    const geoUrl = container.dataset.geoUrl;
    if (!geoUrl) return;

    const byCode = Object.fromEntries(
      points.map((p) => {
        const iso2 = p.code.toUpperCase();
        const iso3 = ISO2_TO_ISO3[iso2] || iso2;
        return [iso3, { name: p.name, count: p.count }];
      })
    );

    const width = container.clientWidth || 640;
    const height = 320;

    const svg = d3
      .select(container)
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const projection = d3.geoNaturalEarth1().precision(0.1);
    const path = d3.geoPath().projection(projection);

    d3.json(geoUrl).then((geo) => {
      if (!geo?.features) return;

      projection.fitExtent(
        [[2, 2], [width - 2, height - 2]],
        { type: "FeatureCollection", features: geo.features }
      );

      svg
        .append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "#c8dce8");

      const layer = svg.append("g").attr("class", "countries");

      let selected = null;

      const countries = layer
        .selectAll("path.country")
        .data(geo.features)
        .join("path")
        .attr("class", (d) => {
          const iso3 = (d.id || "").toUpperCase();
          return byCode[iso3] ? "country has-data" : "country";
        })
        .attr("d", path)
        .on("mouseenter", function (_event, d) {
          const iso3 = (d.id || "").toUpperCase();
          const entry = byCode[iso3];
          const name = entry?.name || d.properties?.name || "Unknown";
          const count = entry?.count ?? 0;
          setMapInfo(name, count);
          d3.select(this).classed("is-hover", true);
        })
        .on("mouseleave", function () {
          d3.select(this).classed("is-hover", false);
          if (!selected) setMapInfo(null, 0);
          else {
            const iso3 = (selected.id || "").toUpperCase();
            const entry = byCode[iso3];
            setMapInfo(
              entry?.name || selected.properties?.name,
              entry?.count ?? 0
            );
          }
        })
        .on("click", function (_event, d) {
          countries.classed("is-selected", false);
          if (selected === d) {
            selected = null;
            setMapInfo(null, 0);
            return;
          }
          selected = d;
          d3.select(this).classed("is-selected", true);
          const iso3 = (d.id || "").toUpperCase();
          const entry = byCode[iso3];
          setMapInfo(
            entry?.name || d.properties?.name || "Unknown",
            entry?.count ?? 0
          );
        });
    });
  }

  /* ---------- Charts ---------- */
  function initTimeline(data) {
    const ctx = document.getElementById("timeline-chart");
    const grad = ctx.getContext("2d").createLinearGradient(0, 0, 0, 200);
    grad.addColorStop(0, "rgba(245,158,11,0.35)");
    grad.addColorStop(1, "rgba(245,158,11,0.0)");

    new Chart(ctx, {
      type: "line",
      data: {
        labels: data.map((d) => d.label),
        datasets: [
          {
            data: data.map((d) => d.value),
            borderColor: COLORS.accent,
            backgroundColor: grad,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 7, color: COLORS.tick },
          },
          y: {
            grid: { color: COLORS.grid },
            ticks: { maxTicksLimit: 5, color: COLORS.tick },
          },
        },
      },
    });
  }

  function horizontalBars(canvasId, data, color) {
    new Chart(document.getElementById(canvasId), {
      type: "bar",
      data: {
        labels: data.map((d) => d.label),
        datasets: [
          {
            data: data.map((d) => d.value),
            backgroundColor: color,
            borderRadius: 3,
            barThickness: 12,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => c.raw.toLocaleString() } },
        },
        scales: {
          x: { grid: { color: COLORS.grid }, ticks: { display: false } },
          y: { grid: { display: false }, ticks: { color: "#cfcfd4" } },
        },
      },
    });
  }

  function initDonut(data) {
    new Chart(document.getElementById("types-chart"), {
      type: "doughnut",
      data: {
        labels: data.map((d) => d.label),
        datasets: [
          {
            data: data.map((d) => d.value),
            backgroundColor: data.map((d) => d.color),
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => `${c.raw}%` } },
        },
      },
    });

    const legend = document.getElementById("types-legend");
    legend.innerHTML = data
      .map(
        (d) =>
          `<li><span class="legend-dot" style="background:${d.color}"></span>` +
          `<span>${d.label}</span><span class="legend-pct">${d.value}%</span></li>`
      )
      .join("");
  }

  /* ---------- Heatmap ---------- */
  function initHeatmap(data) {
    const max = Math.max(...data.cells.map((c) => c.value));
    const byDay = {};
    data.cells.forEach((c) => {
      (byDay[c.day] = byDay[c.day] || []).push(c);
    });

    const container = document.getElementById("heatmap");
    let html = "";
    data.days.forEach((day, di) => {
      const cells = (byDay[di] || []).sort((a, b) => a.hour - b.hour);
      html += `<div class="heatmap-row"><span class="heatmap-label">${day}</span>`;
      cells.forEach((c) => {
        const t = c.value / max;
        const bg =
          t < 0.05
            ? "rgba(255,255,255,0.03)"
            : `rgba(245,158,11,${(0.12 + t * 0.88).toFixed(3)})`;
        html += `<span class="heatmap-cell" style="background:${bg}" title="${day} ${String(
          c.hour
        ).padStart(2, "0")}:00 — ${c.value}"></span>`;
      });
      html += "</div>";
    });
    // Hour axis labels (every 4h).
    let axis = '<div class="heatmap-axis">';
    for (let h = 0; h < 24; h++) axis += `<span>${h % 4 === 0 ? h : ""}</span>`;
    axis += "</div>";
    container.innerHTML = html + axis;
  }

  /* ---------- Boot ---------- */
  function load() {
    getJSON("/api/geo").then(initMap);
    getJSON("/api/timeline").then(initTimeline);
    getJSON("/api/top-usernames").then((d) =>
      horizontalBars("usernames-chart", d, COLORS.accent)
    );
    getJSON("/api/top-passwords").then((d) =>
      horizontalBars("passwords-chart", d, COLORS.red)
    );
    getJSON("/api/event-types").then(initDonut);
    getJSON("/api/heatmap").then(initHeatmap);
  }

  document.addEventListener("DOMContentLoaded", load);

  const refresh = document.getElementById("refresh-btn");
  if (refresh) refresh.addEventListener("click", () => window.location.reload());
})();
