/* HoneyWatch dashboard front-end. Fetches JSON from the Flask API and
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

  function currentRange() {
    const menu = document.getElementById("time-range-menu");
    if (!menu) return "24h";
    const selected = menu.querySelector('[aria-selected="true"]');
    return selected ? selected.dataset.value : "24h";
  }

  function apiUrl(path) {
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}range=${encodeURIComponent(currentRange())}`;
  }

  function applyChartDefaults() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.color = COLORS.tick;
    Chart.defaults.font.family = "Inter, Segoe UI, system-ui, sans-serif";
    Chart.defaults.font.size = 11;
  }

  /* ---------- Map (Leaflet — lightest fit for a VPS dashboard)
   *  ~40 KB lib via CDN; raster tiles from CARTO (not hosted on VPS).
   *  OpenLayers / MapLibre are 5–10× heavier (WebGL + large bundles). ---------- */
  let attackMap = null;
  let markerLayer = null;

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

  function markerRadius(count, min, max) {
    const lo = 6;
    const hi = 26;
    if (max <= min) return (lo + hi) / 2;
    return lo + ((count - min) / (max - min)) * (hi - lo);
  }

  function initMap(points) {
    const el = document.getElementById("attack-map");
    if (!el) return;

    if (typeof L === "undefined") {
      const box = el.parentElement;
      if (box) {
        box.innerHTML =
          '<p class="map-error">Leaflet failed to load. Check your network and hard-refresh (Ctrl+F5).</p>';
      }
      return;
    }

    const valid = points.filter((p) => p.lat != null && p.lng != null);
    if (!valid.length) {
      setMapInfo(null, 0);
      return;
    }

    if (!attackMap) {
      attackMap = L.map(el, {
        center: [22, 12],
        zoom: 2,
        minZoom: 2,
        maxZoom: 6,
        worldCopyJump: true,
        zoomControl: true,
        attributionControl: true,
      });

      // CARTO Dark Matter — matches dashboard theme; tiles offloaded from VPS.
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 6,
          detectRetina: false,
          keepBuffer: 1,
        }
      ).addTo(attackMap);

      markerLayer = L.layerGroup().addTo(attackMap);
    } else {
      markerLayer.clearLayers();
    }

    const counts = valid.map((p) => p.count);
    const minC = Math.min(...counts);
    const maxC = Math.max(...counts);

    valid.forEach((p) => {
      const r = markerRadius(p.count, minC, maxC);
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: r,
        fillColor: COLORS.accent,
        color: "#fde68a",
        weight: 1,
        fillOpacity: 0.75,
      });

      marker.on("mouseover", () => setMapInfo(p.name, p.count));
      marker.on("mouseout", () => setMapInfo(null, 0));
      marker.bindTooltip(
        `<strong>${p.name}</strong><br>${p.count.toLocaleString()} attacks`,
        { direction: "top", offset: [0, -Math.round(r)] }
      );

      markerLayer.addLayer(marker);
    });

    const bounds = L.latLngBounds(valid.map((p) => [p.lat, p.lng]));
    if (valid.length === 1) {
      attackMap.setView(bounds.getCenter(), 4);
    } else {
      attackMap.fitBounds(bounds.pad(0.3));
    }

    requestAnimationFrame(() => attackMap.invalidateSize());
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
            ticks: {
              maxTicksLimit: data.length > 30 ? 12 : data.length > 14 ? 10 : 7,
              color: COLORS.tick,
            },
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
    applyChartDefaults();
    getJSON(apiUrl("/api/geo")).then(initMap);
    getJSON(apiUrl("/api/timeline")).then(initTimeline);
    getJSON(apiUrl("/api/top-usernames")).then((d) =>
      horizontalBars("usernames-chart", d, COLORS.accent)
    );
    getJSON(apiUrl("/api/top-passwords")).then((d) =>
      horizontalBars("passwords-chart", d, COLORS.red)
    );
    getJSON(apiUrl("/api/event-types")).then(initDonut);
    getJSON(apiUrl("/api/heatmap")).then(initHeatmap);
  }

  function initSectionNav() {
    const links = document.querySelectorAll(".nav-item[data-section]");
    if (!links.length) return;

    const setActive = (key) => {
      links.forEach((link) => {
        link.classList.toggle("active", link.dataset.section === key);
      });
    };

    links.forEach((link) => {
      link.addEventListener("click", (e) => {
        const hash = link.getAttribute("href");
        if (!hash || !hash.startsWith("#")) return;
        const target = document.querySelector(hash);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        const qs = window.location.search;
        history.replaceState(null, "", hash + qs);
        setActive(link.dataset.section);
      });
    });

    const sections = Array.from(links)
      .map((link) => {
        const el = document.querySelector(link.getAttribute("href"));
        return el ? { key: link.dataset.section, el } : null;
      })
      .filter(Boolean);

    if (sections.length && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          if (visible.length) {
            const hit = sections.find((s) => s.el === visible[0].target);
            if (hit) setActive(hit.key);
          }
        },
        { rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] }
      );
      sections.forEach((s) => observer.observe(s.el));
    }

    const hash = window.location.hash;
    if (hash) {
      const match = Array.from(links).find((l) => l.getAttribute("href") === hash);
      if (match) setActive(match.dataset.section);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    load();
    initSectionNav();
  });

  const refresh = document.getElementById("refresh-btn");
  if (refresh) refresh.addEventListener("click", () => window.location.reload());
})();
