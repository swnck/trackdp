"use client";

import { useId, useState } from "react";
import { formatMs } from "@/app/lib/trace";
import { useElementWidth } from "@/app/lib/useElementWidth";

const H = 260;
const PAD = { top: 18, right: 18, bottom: 30, left: 52 };

function niceCeil(value) {
  if (!value || value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function buildSegments(hops) {
  const sorted = [...hops].sort((a, b) => a.hop - b.hop);
  const segments = [];
  let current = [];
  for (const hop of sorted) {
    if (hop.avg != null) {
      current.push(hop);
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

export default function LatencyChart({ hops }) {
  const gradientId = `chart-${useId().replace(/:/g, "")}`;
  const [hovered, setHovered] = useState(null);
  const [wrapRef, width] = useElementWidth(760);
  const W = Math.max(width, 200);

  const plottable = hops.filter((h) => h.avg != null);

  if (plottable.length === 0) {
    return <div className="empty">No response times to chart yet.</div>;
  }

  const minHop = Math.min(...hops.map((h) => h.hop));
  const maxHop = Math.max(...hops.map((h) => h.hop));
  const maxVal = niceCeil(Math.max(...plottable.map((h) => h.avg), 0.001));

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const x = (hop) => {
    const span = Math.max(maxHop - minHop, 1);
    return PAD.left + ((hop - minHop) / span) * plotW;
  };
  const y = (v) => PAD.top + plotH - (v / maxVal) * plotH;

  const segments = buildSegments(hops);
  const ticks = [0, 1, 2, 3, 4].map((i) => (maxVal / 4) * i);

  // Thin out the hop-number labels when the route is long.
  const sortedHops = [...hops].sort((a, b) => a.hop - b.hop);
  const labelStep = Math.ceil(sortedHops.length / 14);
  const showLabel = (h) =>
    h.hop === maxHop || (h.hop - minHop) % labelStep === 0;

  const linePath = (seg) =>
    seg.map((h, i) => `${i ? "L" : "M"} ${x(h.hop)} ${y(h.avg)}`).join(" ");

  const areaPath = (seg) => {
    const first = seg[0];
    const last = seg[seg.length - 1];
    return `${linePath(seg)} L ${x(last.hop)} ${y(0)} L ${x(first.hop)} ${y(
      0,
    )} Z`;
  };

  // Tooltip box geometry (SVG coordinates).
  const boxW = 160;
  const boxH = 66;
  let bx = hovered ? x(hovered.hop) + 16 : 0;
  let by = hovered ? y(hovered.avg) - boxH - 12 : 0;
  if (hovered) {
    if (bx + boxW > W - PAD.right) bx = x(hovered.hop) - boxW - 16;
    if (by < PAD.top) by = y(hovered.avg) + 16;
  }

  return (
    <div ref={wrapRef} className="chart-outer">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        role="img"
        aria-label="Response time per hop"
      >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart)" stopOpacity="0.24" />
          <stop offset="100%" stopColor="var(--chart)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            y1={y(t)}
            x2={W - PAD.right}
            y2={y(t)}
            className="chart-grid"
          />
          <text
            x={PAD.left - 10}
            y={y(t)}
            className="chart-tick"
            textAnchor="end"
            dominantBaseline="middle"
          >
            {t === 0 ? "0" : `${+t.toFixed(2)}`}
          </text>
        </g>
      ))}

      {sortedHops.map((h) => (
        <text
          key={h.hop}
          x={x(h.hop)}
          y={H - 9}
          className="chart-tick"
          textAnchor="middle"
        >
          {showLabel(h) ? h.hop : ""}
        </text>
      ))}

      {segments.map((seg, i) => (
        <g key={i}>
          <path d={areaPath(seg)} fill={`url(#${gradientId})`} />
          <path
            d={linePath(seg)}
            fill="none"
            stroke="var(--chart)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>
      ))}

      {hovered && (
        <line
          x1={x(hovered.hop)}
          y1={PAD.top}
          x2={x(hovered.hop)}
          y2={PAD.top + plotH}
          className="chart-guide"
        />
      )}

      {plottable.map((h) => (
        <circle
          key={h.hop}
          cx={x(h.hop)}
          cy={y(h.avg)}
          r="4"
          fill="var(--chart)"
          stroke="#fff"
          strokeWidth="1.5"
          onMouseEnter={() => setHovered(h)}
          onMouseLeave={() => setHovered(null)}
        />
      ))}

      {hovered && (
        <g pointerEvents="none">
          <rect
            x={bx}
            y={by}
            width={boxW}
            height={boxH}
            rx="8"
            className="chart-tooltip"
          />
          <text x={bx + 12} y={by + 18} className="tooltip-title">
            Hop {hovered.hop}
          </text>
          <text x={bx + 12} y={by + 40} className="tooltip-value">
            {formatMs(hovered.avg)}
          </text>
          <text x={bx + 12} y={by + 56} className="tooltip-meta">
            min {formatMs(hovered.min)} · max {formatMs(hovered.max)}
          </text>
        </g>
      )}
      </svg>
    </div>
  );
}
