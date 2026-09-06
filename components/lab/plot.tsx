/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- The SVG chart exposes arrow-key inspection; an HTML image cannot replace its interactive vector content. */
'use client';
import { useState } from 'react';
type Point = { x: number; [key: string]: number };
export function LabPlot({
  data,
  lines,
  logX = false,
  xLabel = 'Hz',
  yLabel = 'dB',
  title,
}: {
  data: Point[];
  lines: { key: string; name: string; color: string; dash?: boolean }[];
  logX?: boolean;
  xLabel?: string;
  yLabel?: string;
  title: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (!data.length) return null;
  const W = 800,
    H = 300,
    L = 60,
    R = 20,
    T = 22,
    B = 43,
    xs = data.map((p) => (logX ? Math.log10(p.x) : p.x)),
    lo = xs[0],
    hi = xs.at(-1)!;
  const values = data
      .flatMap((p) => lines.map((l) => p[l.key]))
      .filter(Number.isFinite),
    min = Math.min(...values),
    max = Math.max(...values),
    span = Math.max(0.01, max - min),
    ylo = min - 0.08 * span,
    yhi = max + 0.08 * span;
  const x = (i: number) => L + ((xs[i] - lo) / (hi - lo || 1)) * (W - L - R),
    y = (v: number) => H - B - ((v - ylo) / (yhi - ylo)) * (H - T - B);
  const format = (v: number) =>
    Math.abs(v) >= 1000
      ? (v / 1000).toFixed(1) + 'k'
      : Math.abs(v) < 1 && v !== 0
        ? v.toFixed(2)
        : v.toFixed(1);
  const index =
    active === null ? null : Math.max(0, Math.min(data.length - 1, active));
  const selected = index === null ? null : data[index];
  return (
    <div className="lab-plot">
      <div className="lab-plot-legend">
        {lines.map((l) => (
          <span key={l.key}>
            <i style={{ background: l.color }} />
            {l.name}
            {l.dash ? ' · dashed' : ''}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            setActive(
              Math.max(
                0,
                Math.min(
                  data.length - 1,
                  (index ?? 0) + (e.key === 'ArrowRight' ? 1 : -1),
                ),
              ),
            );
          }
        }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect(),
            v = (((e.clientX - r.left) / r.width) * W - L) / (W - L - R),
            target = lo + v * (hi - lo);
          let nearest = 0;
          xs.forEach((x, i) => {
            if (Math.abs(x - target) < Math.abs(xs[nearest] - target))
              nearest = i;
          });
          setActive(nearest);
        }}
        onPointerLeave={() => setActive(null)}
      >
        <title>{title}</title>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1={L}
              x2={W - R}
              y1={T + t * (H - T - B)}
              y2={T + t * (H - T - B)}
              stroke="#dce5eb"
            />
            <text
              x={L - 9}
              y={T + t * (H - T - B) + 4}
              textAnchor="end"
              fill="#536b78"
              fontSize="12"
            >
              {format(yhi - t * (yhi - ylo))}
            </text>
            <text
              x={L + t * (W - L - R)}
              y={H - 20}
              textAnchor="middle"
              fill="#536b78"
              fontSize="12"
            >
              {format(logX ? 10 ** (lo + t * (hi - lo)) : lo + t * (hi - lo))}
            </text>
          </g>
        ))}
        <text x={L} y={13} fill="#536b78" fontSize="12">
          {yLabel}
        </text>
        <text x={W - R} y={H - 2} textAnchor="end" fill="#536b78" fontSize="12">
          {xLabel}
        </text>
        {lines.map((l) => (
          <path
            key={l.key}
            d={data
              .map(
                (p, i) =>
                  (i ? 'L' : 'M') +
                  x(i).toFixed(2) +
                  ',' +
                  y(p[l.key]).toFixed(2),
              )
              .join(' ')}
            fill="none"
            stroke={l.color}
            strokeWidth="2.3"
            strokeDasharray={l.dash ? '7 5' : undefined}
          />
        ))}
        {index !== null && (
          <line
            x1={x(index)}
            x2={x(index)}
            y1={T}
            y2={H - B}
            stroke="#718694"
            strokeDasharray="3 4"
          />
        )}
      </svg>
      <output className="lab-plot-readout">
        {selected
          ? `${format(selected.x)} ${xLabel} · ` +
            lines
              .map((l) => `${l.name}: ${selected[l.key].toFixed(2)} ${yLabel}`)
              .join(' · ')
          : 'Hover over the chart, or focus it and use the arrow keys.'}
      </output>
    </div>
  );
}
