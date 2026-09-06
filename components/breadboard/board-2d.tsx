/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- SVG groups and diagrams require ARIA roles; HTML buttons/images cannot replace vector elements. Pointer events are delegated on the SVG; the same part actions are available from keyboard-accessible tray buttons. */
'use client';
import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import {
  HOLES,
  HOLE_MAP,
  ROWS,
  RAILS,
  WIDTH,
  HEIGHT,
  pointOf,
  endpointHole,
  pinsOf,
  formatValue,
  resistorBands,
  capacitorCode,
  nearestHole,
  netColor,
  boardPlan,
  type Circuit,
  type Layout,
  type Placement,
  type Point,
  type Component,
} from '@/lib/breadboard/model';
export type BoardActions = {
  onPart: (ref: string) => void;
  onHover: (ref: string | null) => void;
  onHole: (hole: string) => void;
  onNet: (root: string | null) => void;
  onMove: (ref: string, dx: number, dy: number) => void;
};
export const wirePath = (a: Point, b: Point, lift = 4) =>
  `M${a.x},${a.y} C${a.x},${a.y - lift} ${b.x},${b.y - lift} ${b.x},${b.y}`;
const HoleLayer = memo(function HoleLayer() {
  return (
    <g className="bb-holes">
      {HOLES.map((h) => (
        <g key={h.id}>
          <circle cx={h.x} cy={h.y} r=".72" fill="#d2d0c8" />
          <circle data-hole={h.id} cx={h.x} cy={h.y} r=".46" fill="#555955" />
        </g>
      ))}
    </g>
  );
});
export function PartDrawing({ c, p }: { c: Component; p: Placement }) {
  const a = pointOf(p.pins['1']),
    b = pointOf(p.pins['2']),
    length = Math.hypot(a.x - b.x, a.y - b.y),
    angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (c.type === 'ic_dip8') {
    const p4 = pointOf(p.pins['4']),
      rotation = (Math.atan2(p4.y - a.y, p4.x - a.x) * 180) / Math.PI;
    return (
      <g transform={`translate(${a.x} ${a.y}) rotate(${rotation})`}>
        <rect
          className="bb-part-halo"
          x="-2.5"
          y="-9"
          width="12.62"
          height="11"
          rx="1.5"
        />
        {Array.from({ length: 4 }, (_, i) => (
          <g key={i}>
            <path
              d={`M${i * 2.54},0 v-2 M${i * 2.54},-7.62 v2`}
              stroke="#9c9c91"
              strokeWidth=".85"
            />
            <text
              x={i * 2.54}
              y="1.5"
              textAnchor="middle"
              fill="#334a55"
              fontSize="1.5"
            >
              {i + 1}
            </text>
            <text
              x={i * 2.54}
              y="-8.3"
              textAnchor="middle"
              fill="#334a55"
              fontSize="1.5"
            >
              {8 - i}
            </text>
          </g>
        ))}
        <rect
          x="-1.6"
          y="-5.85"
          width="10.8"
          height="4.15"
          rx=".65"
          fill="#303638"
          stroke="#1c2325"
          strokeWidth=".3"
        />
        <path
          d="M-1.6,-4.8 A1,1 0 0 1 -1.6,-2.8"
          stroke="#797d79"
          strokeWidth=".45"
          fill="none"
        />
        <circle cx="-.35" cy="-2.55" r=".4" fill="#deded3" />
        <text
          x="4.2"
          y="-3.2"
          textAnchor="middle"
          fill="#e3e5db"
          fontSize="1.65"
        >
          {c.part ?? 'DIP-8'}
        </text>
        <text x="4" y="-10.3" textAnchor="middle" fill="#293e46" fontSize="2">
          {c.ref}
        </text>
      </g>
    );
  }
  let bands: string[] = [];
  try {
    bands = resistorBands(c.value!, c.tolerance ?? 0.05).colors;
  } catch {
    /* Non-four-band values retain a printed value. */
  }
  return (
    <g transform={`translate(${mid.x} ${mid.y}) rotate(${angle})`}>
      <rect
        className="bb-part-halo"
        x={-length / 2 - 1.4}
        y="-7.4"
        width={length + 2.8}
        height="10.2"
        rx="1.5"
      />
      {c.type === 'wire' ? (
        <path
          d={wirePath({ x: -length / 2, y: 0 }, { x: length / 2, y: 0 }, 4)}
          fill="none"
          stroke="#48a581"
          strokeWidth="1"
        />
      ) : (
        !['capacitor_ceramic', 'capacitor_electrolytic'].includes(c.type) && (
          <line
            x1={-length / 2}
            x2={length / 2}
            y1="0"
            y2="0"
            stroke="#9a9e94"
            strokeWidth=".6"
          />
        )
      )}
      {c.type === 'resistor' && (
        <>
          <rect
            x="-3.7"
            y="-1.35"
            width="7.4"
            height="2.7"
            rx="1"
            fill="#d8c393"
            stroke="#a99a77"
            strokeWidth=".2"
          />
          {bands.map((color, i) => (
            <rect
              key={i}
              x={[-2.6, -1.25, 0.15, 2.25][i]}
              y="-1.3"
              width=".55"
              height="2.6"
              fill={color}
            />
          ))}
          {!bands.length && (
            <text x="0" y=".5" textAnchor="middle" fontSize="1.5">
              {formatValue(c)}
            </text>
          )}
        </>
      )}
      {c.type === 'capacitor_ceramic' && (
        <>
          <path
            d={`M${-length / 2},0 L-1.4,-2 M${length / 2},0 L1.4,-2`}
            stroke="#98998d"
            fill="none"
            strokeWidth=".55"
          />
          <ellipse
            cy="-3"
            rx="2.5"
            ry="2.1"
            fill="#b9823b"
            stroke="#926225"
            strokeWidth=".2"
          />
          <text
            x="0"
            y="-2.5"
            textAnchor="middle"
            fontSize="1.45"
            fill="#362e20"
          >
            {capacitorCode(c.value!)}
          </text>
        </>
      )}
      {c.type === 'capacitor_film' && (
        <>
          <rect
            x="-3.2"
            y="-3.6"
            width="6.4"
            height="4"
            rx=".65"
            fill="#b86543"
            stroke="#904b35"
            strokeWidth=".2"
          />
          <text
            x="0"
            y="-1.1"
            textAnchor="middle"
            fontSize="1.4"
            fill="#fff4e4"
          >
            {capacitorCode(c.value!)}
          </text>
        </>
      )}
      {c.type === 'capacitor_electrolytic' && (
        <>
          <path
            d={`M${-length / 2},0 H-2.5 M${length / 2},0 H2.5`}
            stroke="#a3a79d"
            strokeWidth=".6"
          />
          <circle r="3.1" fill="#3a586a" stroke="#233b4b" strokeWidth=".4" />
          <path
            d="M1.45,-2.65 A3,3 0 0 1 1.45,2.65 L1.45,-2.65"
            fill="#d8ddcd"
          />
          <text x="2.05" y=".6" fill="#2b4555" fontSize="2">
            −
          </text>
          <path
            d="M-1.7,-1.7 l3.1,3.1 M1.4,-1.7 l-3.1,3.1"
            stroke="#8ea0a1"
            strokeWidth=".22"
          />
          <text
            x={-length / 2}
            y="2.2"
            fontSize="1.8"
            textAnchor="middle"
            fill="#864744"
          >
            +
          </text>
        </>
      )}
      {c.type === 'inductor' && (
        <>
          <rect
            x="-3.8"
            y="-1.6"
            width="7.6"
            height="3.2"
            rx="1.1"
            fill="#5f6564"
          />
          {Array.from({ length: 8 }, (_, i) => (
            <path
              key={i}
              d={`M${-3.1 + i * 0.85},-1.5 q1.2,1.5 0,3`}
              stroke="#bf7940"
              fill="none"
              strokeWidth=".55"
            />
          ))}
        </>
      )}
      <text x="0" y="-5.5" textAnchor="middle" fontSize="2" fill="#293e46">
        {c.ref}
      </text>
    </g>
  );
}
export function Board2D({
  circuit,
  layout,
  selected,
  hovered,
  highlight,
  graph,
  actions,
  zoom = 100,
  svgRef,
}: {
  circuit: Circuit;
  layout: Layout;
  selected: string | null;
  hovered: string | null;
  highlight: string | null;
  graph: Map<string, string>;
  actions: BoardActions;
  zoom?: number;
  svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  const layoutRef = useRef(layout),
    actionsRef = useRef(actions),
    graphRef = useRef(graph),
    drag = useRef<{
      ref: string;
      start: Point;
      dx: number;
      dy: number;
      moved: boolean;
      raf: number;
      group: SVGGElement;
    } | null>(null);
  useLayoutEffect(() => {
    layoutRef.current = layout;
    actionsRef.current = actions;
    graphRef.current = graph;
  }, [layout, actions, graph]);
  const local = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    return new DOMPoint(clientX, clientY).matrixTransform(
      svg.getScreenCTM()!.inverse(),
    );
  };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    for (const e of svg.querySelectorAll<SVGElement>('[data-hole]')) {
      const id = e.dataset.hole!;
      e.setAttribute(
        'fill',
        highlight && graph.get(id) === highlight ? '#00a3aa' : '#555955',
      );
      e.setAttribute(
        'r',
        highlight && graph.get(id) === highlight ? '.7' : '.46',
      );
    }
    for (const e of svg.querySelectorAll<SVGElement>('[data-wire]')) {
      const w = layout.wires.find((w) => w.id === e.dataset.wire);
      e.setAttribute(
        'opacity',
        highlight && w && graph.get(endpointHole(w.a, layout)) !== highlight
          ? '.25'
          : '1',
      );
    }
  }, [highlight, graph, layout, svgRef]);
  function paintDrag() {
    const d = drag.current;
    if (!d) return;
    d.group.setAttribute('transform', `translate(${d.dx} ${d.dy})`);
    for (const wire of layoutRef.current.wires) {
      if (wire.a.attach?.ref !== d.ref && wire.b.attach?.ref !== d.ref)
        continue;
      const a = pointOf(endpointHole(wire.a, layoutRef.current)),
        b = pointOf(endpointHole(wire.b, layoutRef.current));
      if (wire.a.attach?.ref === d.ref) {
        a.x += d.dx;
        a.y += d.dy;
      }
      if (wire.b.attach?.ref === d.ref) {
        b.x += d.dx;
        b.y += d.dy;
      }
      svgRef.current
        ?.querySelector<SVGPathElement>(`[data-wire="${wire.id}"]`)
        ?.setAttribute('d', wirePath(a, b));
    }
    d.raf = 0;
  }
  // Drag previews mutate copied points only; the physical grid stays immutable.
  function resetPreview() {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    d.group.removeAttribute('transform');
    for (const w of layoutRef.current.wires)
      svgRef.current
        ?.querySelector<SVGPathElement>(`[data-wire="${w.id}"]`)
        ?.setAttribute(
          'd',
          wirePath(
            pointOf(endpointHole(w.a, layoutRef.current)),
            pointOf(endpointHole(w.b, layoutRef.current)),
          ),
        );
  }
  return (
    <div className="bb-board-scroll">
      <svg
        ref={svgRef}
        className="bb-board-svg"
        viewBox={`0 -2 ${WIDTH} ${HEIGHT + 4}`}
        style={{ width: `${zoom}%`, minWidth: (800 * zoom) / 100 }}
        aria-label={'Interactive 830-hole breadboard, top view'}
        role="img"
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            const p = local(e.clientX, e.clientY);
            d.dx = p.x - d.start.x;
            d.dy = p.y - d.start.y;
            d.moved ||= Math.hypot(d.dx, d.dy) > 0.5;
            if (!d.raf) d.raf = requestAnimationFrame(paintDrag);
            return;
          }
          const el = (e.target as Element).closest<SVGElement>(
            '[data-hole],[data-wire]',
          );
          const w = el?.dataset.wire
            ? layoutRef.current.wires.find((w) => w.id === el.dataset.wire)
            : null;
          const hole = w
            ? endpointHole(w.a, layoutRef.current)
            : el?.dataset.hole;
          actionsRef.current.onNet(
            hole ? (graphRef.current.get(hole) ?? null) : null,
          );
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          if (!d) return;
          resetPreview();
          drag.current = null;
          if (d.moved) actionsRef.current.onMove(d.ref, d.dx, d.dy);
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {}
        }}
        onPointerCancel={() => {
          resetPreview();
          drag.current = null;
        }}
        onPointerLeave={() => {
          if (!drag.current) {
            actions.onNet(null);
            actions.onHover(null);
          }
        }}
        onClick={(e) => {
          if ((e.target as Element).closest('[data-part],[data-wire]')) return;
          const p = local(e.clientX, e.clientY),
            h = nearestHole(p);
          if (Math.hypot(h.x - p.x, h.y - p.y) < 1.5) actions.onHole(h.id);
        }}
      >
        <title>{`${circuit.title} — physical wiring board`}</title>
        <rect
          x=".6"
          y=".6"
          width={WIDTH - 1.2}
          height={HEIGHT - 1.2}
          rx="2.6"
          fill="#e9e7df"
          stroke="#cbc9c0"
          strokeWidth=".35"
        />
        <rect
          x="2"
          y="1.3"
          width={WIDTH - 4}
          height={HEIGHT - 2.6}
          rx="2"
          fill="#f5f3e9"
        />
        <rect
          x="3"
          y="23.65"
          width={WIDTH - 6}
          height="4.2"
          rx=".7"
          fill="#dcdad1"
        />
        <path d={`M4,24.2 H${WIDTH - 4}`} stroke="#c6c5be" strokeWidth=".35" />
        {RAILS.map((rail, i) => (
          <g key={rail}>
            <path
              d={`M9,${[1.8, 8, 43.7, 50][i]} H${WIDTH / 2 - 4} M${WIDTH / 2 + 4},${[1.8, 8, 43.7, 50][i]} H${WIDTH - 6}`}
              stroke={
                i === 0
                  ? '#ce5e58'
                  : i === 3
                    ? '#527bb1'
                    : i === 1
                      ? '#555f62'
                      : '#9aa2a0'
              }
              strokeWidth=".35"
            />
            <text
              x="2.3"
              y={[4.4, 6.9, 46.3, 48.8][i]}
              fontSize="1.8"
              fill="#52646a"
            >
              {rail}
            </text>
          </g>
        ))}
        {Array.from({ length: 63 }, (_, i) => (
          <text
            key={i}
            x={8 + i * 2.54}
            y="10.4"
            textAnchor="middle"
            fill="#767e77"
            fontSize="1.55"
          >
            {i + 1}
          </text>
        ))}
        {ROWS.map((row) => (
          <text
            key={row}
            x="3.3"
            y={HOLE_MAP.get('1-' + row)!.y + 0.6}
            fill="#64736e"
            fontSize="1.8"
          >
            {row}
          </text>
        ))}
        <HoleLayer />
        {boardPlan(circuit).ports.map((port) => {
          const p = pointOf(port.hole);
          return (
            <g key={port.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r=".85"
                fill={netColor(port.net, circuit)}
                stroke="#faf8ef"
                strokeWidth=".2"
              />
              <text
                x={p.x}
                y={p.y + (port.net === 'IN' || port.net === 'OUT' ? 3.2 : -1.5)}
                textAnchor="middle"
                fontSize="1.65"
                fill="#3d5155"
              >
                {port.label}
              </text>
            </g>
          );
        })}
        <g className="bb-wires">
          {layout.wires.map((w) => (
            <path
              key={w.id}
              data-wire={w.id}
              d={wirePath(
                pointOf(endpointHole(w.a, layout)),
                pointOf(endpointHole(w.b, layout)),
              )}
              fill="none"
              stroke={w.color}
              strokeWidth={selected === w.id ? 1.2 : 0.75}
              strokeLinecap="round"
              onClick={(e) => {
                e.stopPropagation();
                actions.onPart(w.id);
              }}
              onPointerEnter={() =>
                actions.onNet(graph.get(endpointHole(w.a, layout)) ?? null)
              }
            >
              <title>{`${w.id} · ${w.net ?? 'Jumper'} · ${endpointHole(w.a, layout)} → ${endpointHole(w.b, layout)}`}</title>
            </path>
          ))}
        </g>
        {circuit.components
          .filter((c) => layout.parts[c.ref])
          .map((c) => (
            <g
              key={c.ref}
              data-part={c.ref}
              data-active={selected === c.ref || hovered === c.ref}
              className="bb-part"
              tabIndex={0}
              role="button"
              aria-label={`${c.ref} ${formatValue(c)}, drag to move`}
              onFocus={() => actions.onHover(c.ref)}
              onPointerEnter={() => actions.onHover(c.ref)}
              onPointerLeave={() => {
                if (!drag.current) actions.onHover(null);
              }}
              onClick={(e) => {
                e.stopPropagation();
                actions.onPart(c.ref);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') actions.onPart(c.ref);
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                actions.onPart(c.ref);
                svgRef.current?.setPointerCapture(e.pointerId);
                drag.current = {
                  ref: c.ref,
                  start: local(e.clientX, e.clientY),
                  dx: 0,
                  dy: 0,
                  moved: false,
                  raf: 0,
                  group: e.currentTarget,
                };
              }}
            >
              <title>{`${c.ref}: ${formatValue(c)} · ${pinsOf(c)
                .map(([p, n]) => `${p}→${n}`)
                .join(', ')}`}</title>
              <PartDrawing c={c} p={layout.parts[c.ref]} />
            </g>
          ))}
      </svg>
    </div>
  );
}
