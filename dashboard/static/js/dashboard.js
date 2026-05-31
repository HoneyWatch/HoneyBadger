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

  /* ---------- Map (Chart.js geo — lightweight bubble map, no tiles) ---------- */
  let geoFeatures = null;
  let attackMap = null;

  function setMapInfo(name, count) {
    const el = document.getElementById("map-info");
    if (!el) return;
    if (!name) {
      el.textContent = "Hover an attack source for details";
      return;
    }
    el.innerHTML =
      `<strong>${name}</strong> — ` +
      `<span class="map-info-count">${count.toLocaleString()}</span> attack${count === 1 ? "" : "s"}`;
  }

  function loadCountries() {
    if (geoFeatures) return Promise.resolve(geoFeatures);
    return getJSON("/static/vendor/countries-110m.json").then((topo) => {
      geoFeatures = ChartGeo.topojson.feature(
        topo,
        topo.objects.countries
      ).features;
      return geoFeatures;
    });
  }

  function initMap(points) {
    const canvas = document.getElementById("attack-map");
    if (!canvas) return;

    if (typeof ChartGeo === "undefined") {
      const box = canvas.parentElement;
      if (box) {
        box.innerHTML =
          '<p class="map-error">Map plugin missing. Restart <code>python -m dashboard.app</code> and Ctrl+F5.</p>';
      }
      return;
    }

    const valid = points.filter((p) => p.lat != null && p.lng != null);

    loadCountries().then((countries) => {
      if (attackMap) attackMap.destroy();
      attackMap = new Chart(canvas.getContext("2d"), {
        type: "bubbleMap",
        data: {
          labels: valid.map((p) => p.name),
          datasets: [
            {
              outline: countries,
              showOutline: true,
              outlineBackgroundColor: "rgba(255,255,255,0.035)",
              outlineBorderColor: "rgba(255,255,255,0.14)",
              outlineBorderWidth: 0.5,
              backgroundColor: "rgba(245,158,11,0.75)",
              borderColor: "#fde68a",
              borderWidth: 1,
              hoverBackgroundColor: "#f59e0b",
              data: valid.map((p) => ({
                x: p.lng,
                y: p.lat,
                value: p.count,
                name: p.name,
              })),
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          onHover: (_evt, els) => {
            if (els.length) {
              const d = valid[els[0].index];
              setMapInfo(d.name, d.count);
            } else {
              setMapInfo(null, 0);
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (c) =>
                  `${c.raw.name}: ${Number(c.raw.value).toLocaleString()} attacks`,
              },
            },
          },
          scales: {
            projection: { axis: "x", projection: "equalEarth" },
            size: { axis: "x", size: [4, 26] },
          },
        },
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
