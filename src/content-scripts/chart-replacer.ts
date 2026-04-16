/**
 * chart-replacer.ts
 *
 * Detects EduPage's "Leistungen des Schülers" (grafvykonnosti) performance chart,
 * extracts its data from the hidden accessible table, and replaces the static
 * Google Charts SVG with an interactive TradingView lightweight-charts line chart.
 */

import { createChart, ColorType } from "lightweight-charts";
import type { IChartApi, Time } from "lightweight-charts";

// ── date helpers ──────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

/**
 * Converts a locale date string like "Jan 19, 2026" to "2026-01-19".
 * Returns null if the string cannot be parsed.
 */
function parseTableDate(raw: string): string | null {
  const m = raw.trim().match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

// ── types ─────────────────────────────────────────────────────────────────────

interface SeriesDef {
  name: string;
  color: string;
  /** Column index in the HTML table (0 = Datum, 1 = first subject, …, last = avg) */
  colIndex: number;
  isAverage: boolean;
  data: { time: string; value: number }[];
}

// ── data extraction ───────────────────────────────────────────────────────────

/**
 * Builds a map { legendDataCol → CSS color } from the legend sidebar.
 * Each <li data-col="N"> corresponds to table column index N+1
 * (the +1 accounts for the "Datum" column at index 0).
 */
function extractColorMap(legendEl: Element): Map<number, string> {
  const map = new Map<number, string>();
  legendEl.querySelectorAll<HTMLElement>("li.serieLegend").forEach((li) => {
    const colAttr = li.getAttribute("data-col");
    const box = li.querySelector<HTMLElement>(".colorBox");
    if (colAttr === null || !box) return;

    const style = box.getAttribute("style") ?? "";
    const match = style.match(/background-color:\s*([^;]+)/i);
    if (match) {
      map.set(parseInt(colAttr, 10), match[1].trim());
    }
  });
  return map;
}

/**
 * Parses the hidden accessible <table> into an array of SeriesDef objects,
 * one per subject column that has at least one non-empty data point.
 */
function extractSeriesData(
  table: HTMLTableElement,
  colorMap: Map<number, string>,
): SeriesDef[] {
  const headers = Array.from(table.querySelectorAll("thead th")).map(
    (th) => th.textContent?.trim() ?? "",
  );
  // headers: [ "Datum", subject1, subject2, …, "Notendurchschnitt" ]

  const lastColIndex = headers.length - 1;
  const colData = new Map<number, { time: string; value: number }[]>();

  for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
    const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
    const time = parseTableDate(cells[0]?.textContent?.trim() ?? "");
    if (!time) continue;

    for (let ci = 1; ci < cells.length; ci++) {
      const text = cells[ci]?.textContent?.trim();
      if (!text) continue;
      const value = parseFloat(text);
      if (isNaN(value)) continue;

      if (!colData.has(ci)) colData.set(ci, []);
      colData.get(ci)!.push({ time, value });
    }
  }

  const result: SeriesDef[] = [];
  colData.forEach((rawData, colIndex) => {
    if (rawData.length === 0) return;

    const name = headers[colIndex] ?? `Col ${colIndex}`;
    const isAverage = colIndex === lastColIndex;
    // legend data-col = table colIndex - 1  (legend omits "Datum" column)
    const legendCol = colIndex - 1;
    const color =
      colorMap.get(legendCol) ?? (isAverage ? "#000000" : "#888888");

    result.push({
      name,
      color,
      colIndex,
      isAverage,
      data: rawData.slice().sort((a, b) => (a.time < b.time ? -1 : 1)),
    });
  });

  // Render average series last so it draws on top of subject lines
  return result.sort((a, b) => {
    if (a.isAverage && !b.isAverage) return 1;
    if (!a.isAverage && b.isAverage) return -1;
    return a.colIndex - b.colIndex;
  });
}

// ── chart construction ────────────────────────────────────────────────────────

function buildChart(
  outerContainer: HTMLElement,
  chartElem: HTMLElement,
  legendEl: HTMLElement,
): void {
  // The data lives in an aria-hidden table inside chartElem —
  // read it BEFORE we clear chartElem's innerHTML.
  const dataTable = chartElem.querySelector<HTMLTableElement>(
    'div[aria-hidden="true"] table',
  );
  if (!dataTable) {
    console.warn("[AIPage] Performance chart: hidden data table not found");
    return;
  }

  const colorMap = extractColorMap(legendEl);
  const allSeries = extractSeriesData(dataTable, colorMap);

  if (allSeries.length === 0) {
    console.warn("[AIPage] Performance chart: no data series found");
    return;
  }

  // ── dimensions ─────────────────────────────────────────────────────────
  const LEGEND_W = 220;
  const chartW = Math.max((outerContainer.clientWidth || 1200) - LEGEND_W, 400);
  const chartH = Math.max((outerContainer.clientHeight || 640) - 50, 300);

  // ── DOM: replace SVG with a fresh mount point ──────────────────────────
  chartElem.style.marginRight = `${LEGEND_W}px`;
  chartElem.style.height = `${chartH}px`;
  chartElem.innerHTML = "";

  const mountDiv = document.createElement("div");
  mountDiv.style.cssText = `position:relative;width:${chartW}px;height:${chartH}px`;
  chartElem.appendChild(mountDiv);

  // ── lightweight-charts instance ────────────────────────────────────────
  const chart: IChartApi = createChart(mountDiv, {
    width: chartW,
    height: chartH,
    layout: {
      background: { type: ColorType.Solid, color: "rgba(255,255,255,0)" },
      textColor: "#444444",
      fontFamily: "Arial, sans-serif",
      fontSize: 13,
    },
    grid: {
      vertLines: { color: "rgba(0,0,0,0.05)" },
      horzLines: { color: "rgba(0,0,0,0.07)" },
    },
    rightPriceScale: {
      borderColor: "rgba(0,0,0,0.12)",
      scaleMargins: { top: 0.06, bottom: 0.06 },
    },
    timeScale: {
      borderColor: "rgba(0,0,0,0.12)",
      timeVisible: false,
      fixLeftEdge: true,
      fixRightEdge: true,
    },
    // CrosshairMode.Normal = 0 (always follows cursor)
    crosshair: { mode: 0 },
  });

  // ── add one line series per subject ────────────────────────────────────
  // addLineSeries is deprecated in v5 but still functional; cast to any to
  // suppress the TypeScript warning without affecting runtime behaviour.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartAny = chart as any;

  const seriesHandles = allSeries.map((subj) => {
    const s = chartAny.addLineSeries({
      color: subj.color,
      lineWidth: subj.isAverage ? 3 : 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: subj.isAverage ? 6 : 4,
      crosshairMarkerBorderWidth: 2,
    });

    s.setData(subj.data as { time: Time; value: number }[]);
    return s;
  });

  chart.timeScale().fitContent();

  // ── custom tooltip overlay ─────────────────────────────────────────────
  const tooltip = document.createElement("div");
  tooltip.style.cssText = [
    "position:absolute",
    "z-index:200",
    "pointer-events:none",
    "background:rgba(255,255,255,0.97)",
    "border:1px solid #d6d6d6",
    "border-radius:6px",
    "padding:8px 12px",
    "font-family:Arial,sans-serif",
    "font-size:12px",
    "line-height:1.55",
    "box-shadow:0 3px 12px rgba(0,0,0,0.13)",
    "display:none",
    "max-width:270px",
  ].join(";");
  mountDiv.appendChild(tooltip);

  chart.subscribeCrosshairMove((param) => {
    if (
      !param.point ||
      !param.time ||
      param.point.x < 0 ||
      param.point.x > chartW ||
      param.point.y < 0 ||
      param.point.y > chartH
    ) {
      tooltip.style.display = "none";
      return;
    }

    // Gather values for every series at this crosshair position
    const entries = allSeries
      .map((subj, i) => {
        const sd = param.seriesData.get(seriesHandles[i]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const val: number | undefined = (sd as any)?.value;
        return {
          name: subj.name,
          color: subj.color,
          isAvg: subj.isAverage,
          val,
        };
      })
      .filter((e): e is typeof e & { val: number } => e.val !== undefined);

    if (entries.length === 0) {
      tooltip.style.display = "none";
      return;
    }

    // Format date label
    const timeStr = param.time as string;
    const dateLabel = timeStr
      ? new Date(`${timeStr}T12:00:00Z`).toLocaleDateString("de-AT", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";

    // Build HTML — sort descending by value, average always at bottom
    const sorted = entries.slice().sort((a, b) => {
      if (a.isAvg && !b.isAvg) return 1;
      if (!a.isAvg && b.isAvg) return -1;
      return b.val - a.val;
    });

    let html = `<div style="font-weight:700;color:#222;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #eee">${dateLabel}</div>`;
    for (const e of sorted) {
      const boldStyle = e.isAvg
        ? "font-weight:700;border-top:1px solid #eee;padding-top:4px;margin-top:2px;"
        : "";
      html += `
                <div style="${boldStyle}display:flex;align-items:center;gap:7px;padding:1px 0">
                    <span style="width:10px;height:10px;border-radius:50%;background:${e.color};flex-shrink:0;display:inline-block"></span>
                    <span style="flex:1;color:#555;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.name}</span>
                    <span style="color:#222;font-variant-numeric:tabular-nums;font-weight:600">${e.val.toFixed(1)} %</span>
                </div>`;
    }
    tooltip.innerHTML = html;

    // Position tooltip so it stays within the chart bounds
    const ttW = 270;
    const ttH = tooltip.offsetHeight || 180;
    let tx = param.point.x + 18;
    let ty = param.point.y - 20;
    if (tx + ttW > chartW) tx = param.point.x - ttW - 8;
    if (ty + ttH > chartH) ty = chartH - ttH - 4;
    if (ty < 0) ty = 4;

    tooltip.style.left = `${tx}px`;
    tooltip.style.top = `${ty}px`;
    tooltip.style.display = "block";
  });

  // ── responsive resize ─────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    const w = Math.max((outerContainer.clientWidth || 1200) - LEGEND_W, 400);
    const h = Math.max((outerContainer.clientHeight || 640) - 50, 300);
    chart.resize(w, h);
    mountDiv.style.width = `${w}px`;
    mountDiv.style.height = `${h}px`;
  });
  ro.observe(outerContainer);
}

// ── SPA-aware init ─────────────────────────────────────────────────────────────

/**
 * Attempts to find and replace the performance chart once.
 * Returns true if the chart was already replaced or has just been replaced.
 * Returns false if the chart element or its data is not yet present in the DOM.
 */
function tryReplace(): boolean {
  const outer = document.querySelector<HTMLElement>(".znamkyPerformanceChart");
  if (!outer) return false;

  // Already replaced – nothing more to do for this instance
  if (outer.dataset.lwReplaced === "1") return true;

  const chartElem = outer.querySelector<HTMLElement>(".chartElem");
  const legendEl = outer.querySelector<HTMLElement>(".legendElem");
  if (!chartElem || !legendEl) return false;

  // EduPage renders the data table asynchronously; wait until it exists
  if (!chartElem.querySelector('div[aria-hidden="true"] table')) return false;

  // Mark before building so a reentrant mutation won't trigger a second build
  outer.dataset.lwReplaced = "1";

  try {
    buildChart(outer, chartElem, legendEl);
  } catch (err) {
    console.error("[AIPage] Failed to replace performance chart:", err);
    delete outer.dataset.lwReplaced;
    return false;
  }

  return true;
}

/**
 * Initialise the chart replacer. Call this once from content.ts.
 *
 * Handles both classic full-page loads and EduPage's SPA tab-navigation:
 * whenever EduPage inserts a new `.znamkyPerformanceChart` into the DOM
 * (e.g. after the user clicks "Leistungen des Schülers") the observer fires
 * and performs the replacement.
 */
export function initChartReplacer(): void {
  if (tryReplace()) return;

  // Keep watching for the chart element to appear (SPA navigation or
  // deferred rendering of the grade chart view).
  const obs = new MutationObserver(() => {
    tryReplace();
  });

  obs.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
