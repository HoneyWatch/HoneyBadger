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

  const getJSON = (url) => fetch(url).then((r) => r.json());

  Chart.defaults.color = COLORS.tick;
  Chart.defaults.font.family = "Inter, Segoe UI, system-ui, sans-serif";
  Chart.defaults.font.size = 11;

  /* ---------- Map ---------- */
  function initMap(points) {
    const map = L.map("attack-map", {
      attributionControl: true,
      worldCopyJump: true,
      minZoom: 1,
      zoomControl: true,
    }).setView([25, 10], 1.6);

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }
    ).addTo(map);

    const max = Math.max(...points.map((p) => p.count));

    // Heat overlay for the glow effect.
    if (L.heatLayer) {
      const heat = points.map((p) => [p.lat, p.lng, p.count / max]);
      L.heatLayer(heat, {
        radius: 28,
        blur: 22,
        maxZoom: 6,
        gradient: { 0.2: "#7c2d12", 0.5: "#ea7c1f", 1.0: "#f59e0b" },
      }).addTo(map);
    }

    points.forEach((p) => {
      const r = 4 + (p.count / max) * 14;
      L.circleMarker([p.lat, p.lng], {
        radius: r,
        color: COLORS.accent,
        weight: 1,
        fillColor: COLORS.accent,
        fillOpacity: 0.55,
      })
        .bindTooltip(
          `<strong>${p.name}</strong><br>${p.count.toLocaleString()} attacks`,
          { direction: "top" }
        )
        .addTo(map);
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
