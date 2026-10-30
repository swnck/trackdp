"use client";

import { useId, useState } from "react";
import { formatHopHost, formatMs } from "@/app/lib/trace";
import { useElementWidth } from "@/app/lib/useElementWidth";

const NODE_R = 18;
const CELL_W = 132;
const CELL_H = 106;
const PAD_X = 48;
const PAD_Y = 42;

function truncate(value, max = 14) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export default function RouteMap({ hops }) {
  const arrowId = `arrow-${useId().replace(/:/g, "")}`;
  const arrowRedId = `arrow-red-${useId().replace(/:/g, "")}`;
  const [wrapRef, availWidth] = useElementWidth(880);
  const [hovered, setHovered] = useState(null);

  if (!hops.length) {
    return <div className="empty">No route to display yet.</div>;
  }

  // Wrap the fixed-size node grid to the available width.
  const maxPerRow = Math.max(1, Math.floor((availWidth - PAD_X * 2) / CELL_W));
  const perRow = Math.min(hops.length, maxPerRow);
  const rows = Math.ceil(hops.length / perRow);

  const pos = (index) => {
    const r = Math.floor(index / perRow);
    let c = index % perRow;
    if (r % 2 === 1) c = perRow - 1 - c;
    return { x: PAD_X + c * CELL_W, y: PAD_Y + r * CELL_H };
  };

  const width = PAD_X * 2 + perRow * CELL_W;
  const height = PAD_Y * 2 + rows * CELL_H;

  const edges = [];
  for (let i = 0; i < hops.length - 1; i++) {
    const a = pos(i);
    const b = pos(i + 1);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    edges.push({
      x1: a.x + ux * NODE_R,
      y1: a.y + uy * NODE_R,
      x2: b.x - ux * NODE_R,
      y2: b.y - uy * NODE_R,
    });
  }

  // Tooltip anchor + placement for the hovered node.
  const tip =
    hovered != null && hops[hovered]
      ? { hop: hops[hovered], ...pos(hovered) }
      : null;

  let tooltipStyle = null;
  if (tip) {
    const placeRight = tip.x <= availWidth - 180;
    tooltipStyle = {
      left: placeRight ? tip.x + NODE_R + 12 : tip.x - NODE_R - 12,
      top: tip.y,
      transform: `translate(${placeRight ? "0" : "-100%"}, -50%)`,
    };
  }

  const hostText = tip ? formatHopHost(tip.hop) : null;

  return (
    <div ref={wrapRef} className="route-outer">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="route-map"
        role="img"
        aria-label="Route path from source to destination"
      >
      <defs>
        <marker
          id={arrowId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="route-arrow" />
        </marker>
        <marker
          id={arrowRedId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="route-arrow-final" />
        </marker>
      </defs>

      {edges.map((e, i) => {
        const isFinal = i === edges.length - 1;
        return (
          <line
            key={i}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            className={`route-edge${isFinal ? " route-edge-final" : ""}`}
            markerEnd={`url(#${isFinal ? arrowRedId : arrowId})`}
          />
        );
      })}

      {hops.map((h, i) => {
        const p = pos(i);
        const isLast = i === hops.length - 1;
        const isFirst = i === 0;
        const cls = isLast
          ? "node-dest"
          : isFirst
            ? "node-start"
            : h.timeout
              ? "node-timeout"
              : "node-hop";

        return (
          <g
            key={h.hop}
            className={`${cls} route-node`}
            transform={`translate(${p.x} ${p.y})`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <circle r={NODE_R} className="node-circle" />
            <text className="node-num" textAnchor="middle" dominantBaseline="central">
              {h.hop}
            </text>
            <text className="node-label" y={NODE_R + 16} textAnchor="middle">
              {truncate(h.label)}
            </text>
            <text className="node-ms" y={NODE_R + 31} textAnchor="middle">
              {h.timeout ? "timeout" : formatMs(h.avg)}
            </text>
          </g>
        );
      })}
    </svg>

      {tip && (
        <div className="route-tooltip" style={tooltipStyle} role="tooltip">
          <div className="rt-head">
            <span className="rt-title">Hop {tip.hop.hop}</span>
            {tip.hop.timeout ? (
              <span className="rt-badge rt-badge-timeout">timeout</span>
            ) : (
              <span className="rt-badge rt-badge-ok">reached</span>
            )}
          </div>

          {hostText && <div className="rt-host">{hostText}</div>}

          {tip.hop.timeout ? (
            <div className="rt-empty">No response from this hop</div>
          ) : (
            <div className="rt-stats">
              <div className="rt-stat">
                <span>avg</span>
                <b>{formatMs(tip.hop.avg)}</b>
              </div>
              <div className="rt-stat">
                <span>min</span>
                <b>{formatMs(tip.hop.min)}</b>
              </div>
              <div className="rt-stat">
                <span>max</span>
                <b>{formatMs(tip.hop.max)}</b>
              </div>
            </div>
          )}

          {tip.hop.times?.length > 0 && (
            <div className="rt-probes">
              <span className="rt-probes-label">probes</span>
              {tip.hop.times.map((t, i) => (
                <span key={i} className="rt-probe">
                  {t == null ? "*" : formatMs(t)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
