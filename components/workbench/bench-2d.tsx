/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events -- The bench is a vector canvas: pointer events are delegated on the SVG. Every action is also reachable from the keyboard-accessible toolbar and library buttons. */
'use client';
import { AccessoryBody } from './accessory-body';
// Top-down technical view of the workbench. Everything is drawn in table
// millimetres; the SVG viewBox provides pan and zoom, so hit areas and visuals
// stay in the same coordinate system as the 3D view.
import { megaCAD } from '@/lib/workbench/cad/mega-rev3e';
import { unoCAD } from '@/lib/workbench/cad/uno-rev3e';
import type { RuntimeFrame } from '@/lib/workbench/runtime/circuit';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { GROUP_HOLES, HOLES, HOLE_MAP } from '@/lib/breadboard/model';
import {
  effectiveTransform,
  endpointPoint,
  localToTable,
  tableToLocal,
  workbenchBounds,
} from '@/lib/workbench/geometry';
import type { PhysicalModel } from '@/lib/workbench/physical';
import type {
  BenchWire,
  ConnectionEndpoint,
  Instance,
  ModelLookup,
  Workbench,
} from '@/lib/workbench/types';
import { endpointKey } from '@/lib/workbench/types';
import {
  capacitorCode,
  formatValue,
  PIN_TINT,
  resistorBands,
  wirePath,
} from './draw';

export type View = { x: number; y: number; scale: number; focus?: string };

type Props = {
  runtime: RuntimeFrame;
  workbench: Workbench;
  lookup: ModelLookup;
  selection: string | null;
  selectedWire: string | null;
  tool: 'select' | 'wire' | 'probe';
  wireStart: ConnectionEndpoint | null;
  highlightNet: string | null;
  showLabels: boolean;
  showGrid: boolean;
  view: View;
  netOf: (e: ConnectionEndpoint) => string | null;
  onView: (v: View) => void;
  onSelectInstance: (id: string | null) => void;
  onSelectWire: (id: string | null) => void;
  onPickEndpoint: (e: ConnectionEndpoint) => void;
  onHoverEndpoint: (e: ConnectionEndpoint | null) => void;
  onFocus: (id: string) => void;
  onEditWire: (id: string, patch: Partial<BenchWire>, done?: boolean) => void;
  onRewire: (id: string, side: 'a' | 'b') => void;
  onMove: (id: string, dx: number, dy: number, done: boolean) => void;
};

const HOLE_R = 0.62;
const PIN_R = 0.78;

const HoleLayer = memo(function HoleLayer() {
  return (
    <g>
      {HOLES.map((h) => (
        <circle key={h.id} cx={h.x} cy={h.y} r={HOLE_R} className="wb-hole" />
      ))}
    </g>
  );
});

function BreadboardBody({ model }: { model: PhysicalModel }) {
  return (
    <g>
      <rect
        x={0}
        y={0}
        width={model.body.w}
        height={model.body.h}
        rx={model.body.radius ?? 2}
        fill="var(--wb-bb, #efeade)"
        stroke="var(--wb-edge, #c9c2b0)"
        strokeWidth={0.4}
      />
      <rect
        x={4}
        y={24.6}
        width={model.body.w - 8}
        height={4.4}
        fill="rgba(0,0,0,.06)"
      />
      {[
        { y: 4.87, c: '#d0342c' },
        { y: 46.77, c: '#d0342c' },
      ].map((r, i) => (
        <line
          key={'p' + i}
          x1={6}
          y1={r.y - 2.6}
          x2={model.body.w - 6}
          y2={r.y - 2.6}
          stroke="#d0342c"
          strokeWidth={0.35}
          opacity={0.7}
        />
      ))}
      {[{ y: 4.87 }, { y: 46.77 }].map((r, i) => (
        <line
          key={'n' + i}
          x1={6}
          y1={r.y + 2.6}
          x2={model.body.w - 6}
          y2={r.y + 2.6}
          stroke="#2f6fd0"
          strokeWidth={0.35}
          opacity={0.7}
        />
      ))}
      <HoleLayer />
    </g>
  );
}

function UnoBody({
  brightness,
  running,
  mega,
}: {
  brightness: number;
  running: boolean;
  mega: boolean;
}) {
  const cad = mega ? megaCAD : unoCAD;
  return (
    <g>
      <path
        d={'M' + cad.outline.map((p) => p.join(',')).join('L') + 'Z'}
        fill="#087d81"
        stroke="#095b5e"
        strokeWidth={0.4}
      />
      <g stroke="#149092" opacity={0.55}>
        {cad.traces.map((p, i) => (
          <line
            key={i}
            x1={p[0]}
            y1={p[1]}
            x2={p[2]}
            y2={p[3]}
            strokeWidth={p[4]}
          />
        ))}
      </g>
      <g stroke="#dcebe3">
        {cad.silk.map((p, i) => (
          <line
            key={i}
            x1={p[0]}
            y1={p[1]}
            x2={p[2]}
            y2={p[3]}
            strokeWidth={Math.max(0.07, p[4])}
          />
        ))}
      </g>
      {cad.pads.map((p, i) => (
        <rect
          key={i}
          x={p.x - p.w / 2}
          y={p.y - p.h / 2}
          width={p.w}
          height={p.h}
          rx={p.drill ? 0.4 : 0.1}
          fill={p.drill ? '#b4a876' : '#bac7cd'}
        />
      ))}
      {cad.elements.map((e) => (
        <g key={e.name}>
          {e.kind === 'can' ? (
            <g>
              <circle
                cx={e.x + e.w / 2}
                cy={e.y + e.h / 2}
                r={3.2}
                fill="#2d3942"
              />
              <circle
                cx={e.x + e.w / 2}
                cy={e.y + e.h / 2}
                r={2.9}
                fill="#b5c0c8"
              />
              <path
                d={`M${e.x + e.w / 2 - 1.5},${e.y + e.h / 2}h3`}
                stroke="#727b83"
                strokeWidth={0.2}
              />
            </g>
          ) : (
            <rect
              x={e.x}
              y={e.y}
              width={e.w}
              height={e.h}
              rx={e.kind === 'usb' ? 0.6 : 0.2}
              fill={
                e.kind === 'usb' || e.kind === 'crystal'
                  ? '#b9c6d0'
                  : e.kind === 'led'
                    ? e.name === 'ON'
                      ? '#71a847'
                      : '#aa7738'
                    : e.kind === 'smd' && e.name.startsWith('C')
                      ? '#aa8e63'
                      : '#1b252e'
              }
              stroke="rgba(0,0,0,.3)"
              strokeWidth={0.14}
            />
          )}
          {e.kind === 'ic' && e.w > 4 && (
            <text
              x={e.x + e.w / 2}
              y={e.y + e.h / 2}
              textAnchor="middle"
              fontSize={e.name === 'ZU4' ? 1.3 : 0.7}
              fill="#9aa4ad"
            >
              {e.value}
            </text>
          )}
          {e.kind === 'led' && (
            <circle
              cx={e.x + e.w / 2}
              cy={e.y + e.h / 2}
              r={0.8}
              fill={e.name === 'ON' ? '#a3ff65' : '#ffb640'}
              opacity={
                e.name === 'ON'
                  ? running
                    ? 1
                    : 0.1
                  : e.name === 'L'
                    ? 0.1 + brightness * 0.9
                    : 0.1
              }
            />
          )}
        </g>
      ))}
      {cad.mounts.map((m, i) => (
        <circle
          key={i}
          cx={m.x}
          cy={m.y}
          r={m.d / 2}
          fill="var(--wb-bg)"
          stroke="#b0ad8e"
          strokeWidth={0.4}
        />
      ))}
    </g>
  );
}

function Feature({ f }: { f: NonNullable<PhysicalModel['features']>[number] }) {
  switch (f.kind) {
    case 'header':
      return (
        <rect
          x={f.x}
          y={f.y}
          width={f.w}
          height={f.h}
          rx={0.6}
          fill="#1d2126"
          opacity={0.85}
        />
      );
    case 'usb':
      return (
        <rect
          x={f.x}
          y={f.y}
          width={f.w}
          height={f.h}
          rx={0.8}
          fill="#b9bec4"
          stroke="#8b9198"
          strokeWidth={0.3}
        />
      );
    case 'barrel':
      return (
        <rect
          x={f.x}
          y={f.y}
          width={f.w}
          height={f.h}
          rx={1.5}
          fill="#1b1b1b"
        />
      );
    case 'ic':
      return (
        <g>
          <rect
            x={f.x}
            y={f.y}
            width={f.w}
            height={f.h}
            rx={0.6}
            fill="#23282c"
          />
          <circle cx={f.x + 1.4} cy={f.y + 1.4} r={0.5} fill="#4b5560" />
        </g>
      );
    case 'shield':
      return (
        <g>
          <rect
            x={f.x}
            y={f.y}
            width={f.w}
            height={f.h}
            rx={1}
            fill="#9aa0a6"
            stroke="#7b8188"
            strokeWidth={0.3}
          />
          <text
            x={f.x + f.w / 2}
            y={f.y + f.h / 2 + 1}
            fontSize={2.2}
            textAnchor="middle"
            fill="#3a3f45"
          >
            {f.label}
          </text>
        </g>
      );
    case 'crystal':
      return (
        <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={2} fill="#c2c7cc" />
      );
    case 'button':
      return (
        <g>
          <rect
            x={f.x - f.d}
            y={f.y - f.d}
            width={f.d * 2}
            height={f.d * 2}
            rx={0.6}
            fill="#2b2b2b"
          />
          <circle cx={f.x} cy={f.y} r={f.d * 0.55} fill="#d8d8d8" />
        </g>
      );
    case 'led':
      return <circle cx={f.x} cy={f.y} r={0.9} fill={f.color} />;
    case 'antenna':
      return (
        <g>
          <rect
            x={f.x}
            y={f.y}
            width={f.w}
            height={f.h}
            fill="none"
            stroke="#c9a227"
            strokeWidth={0.4}
            strokeDasharray="1 0.8"
          />
        </g>
      );
    case 'silk':
      return (
        <text
          x={f.x}
          y={f.y}
          fontSize={f.size ?? 3}
          fill="#ffffff"
          opacity={0.55}
          fontWeight={700}
        >
          {f.text}
        </text>
      );
    default:
      return null;
  }
}

function PartBody({
  model,
  inst,
  brightness,
}: {
  model: PhysicalModel;
  inst: Instance;
  brightness: number;
}) {
  const { w, h } = model.body;
  if (model.id === 'part-resistor') {
    const bands = resistorBands(inst.value ?? 10000, inst.tolerance ?? 0.05);
    return (
      <g>
        <line
          x1={0}
          y1={h / 2}
          x2={w}
          y2={h / 2}
          stroke="#9aa3ad"
          strokeWidth={0.5}
        />
        <rect
          x={w * 0.22}
          y={0}
          width={w * 0.56}
          height={h}
          rx={1.1}
          fill="#c9b28a"
          stroke="#a8916c"
          strokeWidth={0.25}
        />
        {bands.map((c, i) => (
          <rect
            key={i}
            x={w * 0.28 + i * w * 0.11}
            y={0.15}
            width={w * 0.055}
            height={h - 0.3}
            fill={c}
          />
        ))}
      </g>
    );
  }
  if (model.id.startsWith('part-capacitor')) {
    const disc = model.id.endsWith('ceramic');
    return (
      <g>
        <line
          x1={0}
          y1={h / 2}
          x2={w}
          y2={h / 2}
          stroke="#9aa3ad"
          strokeWidth={0.5}
        />
        {disc ? (
          <ellipse
            cx={w / 2}
            cy={h / 2}
            rx={w * 0.46}
            ry={h * 0.48}
            fill="#3f6ea8"
          />
        ) : (
          <rect
            x={w * 0.1}
            y={0}
            width={w * 0.8}
            height={h}
            rx={0.8}
            fill={model.body.color}
          />
        )}
        <text
          x={w / 2}
          y={h / 2 + 0.8}
          fontSize={1.7}
          textAnchor="middle"
          fill="#ffffff"
        >
          {capacitorCode(inst.value ?? 1e-7)}
        </text>
      </g>
    );
  }
  if (model.id === 'part-led')
    return (
      <g>
        <line
          x1={0}
          y1={h / 2}
          x2={w}
          y2={h / 2}
          stroke="#9aa3ad"
          strokeWidth={0.5}
        />
        <circle
          cx={w / 2}
          cy={h / 2}
          r={2.8}
          fill="#781d18"
          stroke="#c12b23"
          strokeWidth={0.3}
        />
        <circle
          cx={w / 2}
          cy={h / 2}
          r={2.5}
          fill="#ff4929"
          opacity={0.25 + brightness * 0.75}
        />
        {brightness > 0.01 && (
          <circle
            cx={w / 2}
            cy={h / 2}
            r={4}
            fill="#ff641a"
            opacity={brightness * 0.3}
          />
        )}
      </g>
    );
  if (model.id === 'part-button')
    return (
      <g>
        <rect x={0} y={0} width={w} height={h} rx={0.8} fill="#202a33" />
        <rect
          x={0.5}
          y={0.5}
          width={w - 1}
          height={h - 1}
          rx={0.4}
          fill="#b8c6cf"
          stroke="#7d8d98"
          strokeWidth={0.3}
        />
        <circle cx={w / 2} cy={h / 2} r={1.7} fill="#29323a" />
        {[0.9, w - 0.9].flatMap((x) =>
          [0.9, h - 0.9].map((y) => (
            <circle key={`${x}/${y}`} cx={x} cy={y} r={0.4} fill="#8c969d" />
          )),
        )}
      </g>
    );
  if (model.id === 'part-potentiometer')
    return (
      <g>
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          rx={0.8}
          fill="#146eb2"
          stroke="#09508a"
          strokeWidth={0.4}
        />
        <circle
          cx={w / 2}
          cy={h / 2}
          r={3}
          fill="#a5c8da"
          stroke="#467997"
          strokeWidth={0.3}
        />
        <path
          d={`M${w / 2 - 2},${h / 2}h4`}
          stroke="#334b5b"
          strokeWidth={0.6}
        />
        <text
          x={w / 2}
          y={h - 0.8}
          textAnchor="middle"
          fontSize={1.2}
          fill="#e6eff2"
        >
          103
        </text>
      </g>
    );
  if (model.id === 'part-inductor')
    return (
      <g>
        <rect x={0} y={1} width={w} height={h - 2} rx={1} fill="#2f3337" />
        {Array.from({ length: 9 }, (_, k) => (
          <ellipse
            key={k}
            cx={w * 0.12 + k * w * 0.095}
            cy={h / 2}
            rx={w * 0.075}
            ry={h * 0.42}
            fill="none"
            stroke="#bd7939"
            strokeWidth={0.45}
          />
        ))}
      </g>
    );
  if (model.id === 'part-ic-dip8')
    return (
      <g>
        {model.pins.map((p) => (
          <line
            key={p.id}
            x1={p.x}
            y1={p.y}
            x2={p.x}
            y2={h / 2}
            stroke="#adbac4"
            strokeWidth={0.7}
          />
        ))}
        <rect
          x={0}
          y={h * 0.2}
          width={w}
          height={h * 0.6}
          rx={0.5}
          fill="#20262c"
        />
        <circle cx={1.2} cy={h * 0.35} r={0.45} fill="#717a7d" />
        <text
          x={w / 2}
          y={h / 2 + 0.5}
          fontSize={1.3}
          textAnchor="middle"
          fill="#bbc3c9"
        >
          DIP-8
        </text>
      </g>
    );
  return (
    <rect
      x={0}
      y={0}
      width={w}
      height={h}
      rx={model.body.radius ?? 0.8}
      fill={model.body.color}
      opacity={0.92}
    />
  );
}

export function Bench2D(props: Props) {
  const {
    workbench,
    lookup,
    selection,
    selectedWire,
    tool,
    wireStart,
    highlightNet,
    showLabels,
    showGrid,
    view,
    netOf,
    onView,
    onSelectInstance,
    onSelectWire,
    onPickEndpoint,
    onHoverEndpoint,
    onMove,
  } = props;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{
    id: string | null;
    x: number;
    y: number;
    pan: boolean;
  } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const toTable = useCallback((ev: { clientX: number; clientY: number }) => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const matrix = el.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(
      matrix.inverse(),
    );
    return { x: p.x, y: p.y };
  }, []);

  const bounds = useMemo(
    () => workbenchBounds(workbench, lookup),
    [workbench, lookup],
  );
  const [cameraFrame, setCameraFrame] = useState({ bounds, view });
  // Adjust state only for a new explicit fit command, never on object dragging.
  if (
    view !== cameraFrame.view &&
    view.x === 0 &&
    view.y === 0 &&
    view.scale === 1
  )
    setCameraFrame({ bounds, view });
  const frame = cameraFrame.bounds;
  const focused = workbench.instances.find((i) => i.id === view.focus);
  const fm = focused && lookup(focused.modelId);
  const pose =
    focused && fm ? effectiveTransform(focused, fm, workbench, lookup) : null;
  const fw = fm ? Math.max(fm.body.w, fm.body.h) * 1.6 : frame.w + 30;
  const fh = fm ? Math.max(fm.body.w, fm.body.h) * 1.2 : frame.h + 30;
  const vw = Math.max(30, fw) / view.scale,
    vh = Math.max(25, fh) / view.scale;
  const cx = pose?.x ?? frame.x + frame.w / 2,
    cy = pose?.y ?? frame.y + frame.h / 2;
  const viewBox = `${cx - vw / 2 + view.x} ${cy - vh / 2 + view.y} ${vw} ${vh}`;
  const bendDrag = useRef<{ id: string; index: number } | null>(null);

  const wireStartPoint = wireStart
    ? endpointPoint(wireStart, workbench, lookup)
    : null;

  const onPointerDown = (ev: React.PointerEvent) => {
    if (tool !== 'select') return;
    const t = toTable(ev);
    drag.current = { id: null, x: t.x, y: t.y, pan: true };
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    const t = toTable(ev);
    setCursor(t);
    if (bendDrag.current) {
      const { id, index } = bendDrag.current;
      const wire = workbench.wires.find((w) => w.id === id);
      if (wire)
        props.onEditWire(
          id,
          { route: wire.route.map((p, i) => (i === index ? t : p)) },
          false,
        );
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = t.x - d.x,
      dy = t.y - d.y;
    if (d.pan) {
      onView({ ...view, x: view.x - dx, y: view.y - dy });
    } else if (d.id) {
      onMove(d.id, dx, dy, false);
      d.x = t.x;
      d.y = t.y;
    }
  };
  const endDrag = () => {
    if (bendDrag.current) {
      props.onEditWire(bendDrag.current.id, {}, true);
      bendDrag.current = null;
    }
    if (drag.current?.id) onMove(drag.current.id, 0, 0, true);
    drag.current = null;
  };

  const instanceDown = (ev: React.PointerEvent, id: string) => {
    if (tool !== 'select') return;
    ev.stopPropagation();
    onSelectInstance(id);
    const t = toTable(ev);
    drag.current = { id, x: t.x, y: t.y, pan: false };
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  };

  const endpointProps = (e: ConnectionEndpoint, label: string) => ({
    onPointerEnter: () => onHoverEndpoint(e),
    onPointerLeave: () => onHoverEndpoint(null),
    onPointerDown: (ev: React.PointerEvent) => {
      ev.stopPropagation();
      onPickEndpoint(e);
    },
    'data-endpoint': endpointKey(e),
    'aria-label': label,
  });

  return (
    <svg
      ref={svgRef}
      className={`wb-svg wb-tool-${tool}`}
      viewBox={viewBox}
      onPointerDown={(ev) => {
        if (ev.target === svgRef.current) {
          onSelectInstance(null);
          onSelectWire(null);
        }
        onPointerDown(ev);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={(ev) => {
        if (ev.key === 'Escape') {
          onSelectInstance(null);
          onSelectWire(null);
        }
      }}
      onWheel={(ev) => {
        const k = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
        onView({ ...view, scale: Math.max(0.25, Math.min(9, view.scale * k)) });
      }}
      role="application"
      aria-label="Workbench top view"
    >
      {showGrid && (
        <g className="wb-grid">
          {Array.from({ length: 120 }, (_, i) => bounds.x - 30 + i * 10).map(
            (x) => (
              <line
                key={'gx' + x}
                x1={x}
                y1={bounds.y - 30}
                x2={x}
                y2={bounds.y + bounds.h + 30}
              />
            ),
          )}
          {Array.from({ length: 80 }, (_, i) => bounds.y - 30 + i * 10).map(
            (y) => (
              <line
                key={'gy' + y}
                x1={bounds.x - 30}
                y1={y}
                x2={bounds.x + bounds.w + 30}
                y2={y}
              />
            ),
          )}
        </g>
      )}

      {workbench.instances.map((inst) => {
        const model = lookup(inst.modelId);
        if (!model) return null;
        const o = model.origin;
        const pose = effectiveTransform(inst, model, workbench, lookup);
        const transform = `translate(${pose.x} ${pose.y}) rotate(${pose.rot}) translate(${-o.x} ${-o.y})`;
        const isSel = selection === inst.id;
        return (
          <g
            key={inst.id}
            transform={transform}
            className={isSel ? 'wb-inst wb-sel' : 'wb-inst'}
            data-instance={inst.id}
            data-model={inst.modelId}
          >
            <g
              onDoubleClick={() => props.onFocus(inst.id)}
              onPointerDown={(ev) => instanceDown(ev, inst.id)}
              style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
            >
              {model.kind === 'breadboard' ? (
                <BreadboardBody model={model} />
              ) : model.kind === 'part' ? (
                <PartBody
                  model={model}
                  inst={inst}
                  brightness={props.runtime.leds[inst.id] ?? 0}
                />
              ) : model.accessoryVisual ? (
                <AccessoryBody model={model} />
              ) : ['uno-rev3', 'mega-2560'].includes(model.id) ? (
                <UnoBody
                  mega={model.id === 'mega-2560'}
                  brightness={props.runtime.leds[inst.id] ?? 0}
                  running={props.runtime.running}
                />
              ) : (
                <g>
                  <rect
                    x={0}
                    y={0}
                    width={model.body.w}
                    height={model.body.h}
                    rx={model.body.radius ?? 2}
                    fill={model.body.color}
                    stroke="rgba(0,0,0,.45)"
                    strokeWidth={0.3}
                  />
                  {model.mounts?.map((m, i) => (
                    <circle
                      key={i}
                      cx={m.x}
                      cy={m.y}
                      r={m.d / 2}
                      fill="var(--wb-bg,#f7f7f5)"
                      stroke="rgba(0,0,0,.3)"
                      strokeWidth={0.25}
                    />
                  ))}
                  {model.features?.map((f, i) => (
                    <Feature key={i} f={f} />
                  ))}
                </g>
              )}
            </g>

            {/* Pin hit areas and labels come from the same physical definition. */}
            {model.pins.map((original) => {
              const p = { ...original };
              const e: ConnectionEndpoint = {
                kind: model.kind === 'board' ? 'board-pin' : 'component-pin',
                instanceId: inst.id,
                pinId: p.id,
              };
              if (inst.mounted) {
                const at = endpointPoint(e, workbench, lookup);
                if (at) Object.assign(p, tableToLocal(pose, model.origin, at));
              }
              const net = netOf(e);
              const lit = highlightNet !== null && net === highlightNet;
              const isStart =
                wireStart && endpointKey(wireStart) === endpointKey(e);
              return (
                <g
                  key={p.id}
                  className="wb-pin"
                  {...endpointProps(e, `${inst.name} ${p.group} ${p.label}`)}
                >
                  <circle cx={p.x} cy={p.y} r={1.5} fill="transparent" />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isStart ? PIN_R + 0.5 : PIN_R}
                    fill={
                      isStart
                        ? '#e0a010'
                        : lit
                          ? '#2f9e5f'
                          : isSel
                            ? PIN_TINT[p.type]
                            : '#262b30'
                    }
                    stroke="rgba(255,255,255,.55)"
                    strokeWidth={0.18}
                  />
                  {showLabels &&
                    (isSel || view.scale >= 2 || view.focus === inst.id) && (
                      <text
                        x={p.x}
                        y={p.y - 1.6}
                        fontSize={2.1}
                        textAnchor="middle"
                        className="wb-pinlabel"
                        pointerEvents="none"
                        transform={`rotate(${-pose.rot} ${p.x} ${p.y - 1.6})`}
                      >
                        {p.label}
                      </text>
                    )}
                </g>
              );
            })}

            {/* Breadboard hole hit areas. */}
            {model.kind === 'breadboard' &&
              HOLES.map((h) => {
                const e: ConnectionEndpoint = {
                  kind: 'breadboard-hole',
                  instanceId: inst.id,
                  holeId: h.id,
                };
                const net = netOf(e);
                const lit = highlightNet !== null && net === highlightNet;
                const isStart =
                  wireStart && endpointKey(wireStart) === endpointKey(e);
                return (
                  <g
                    key={h.id}
                    className="wb-holehit"
                    {...endpointProps(e, `${inst.name} hole ${h.id}`)}
                  >
                    <circle cx={h.x} cy={h.y} r={1.2} fill="transparent" />
                    {(lit || isStart) && (
                      <circle
                        cx={h.x}
                        cy={h.y}
                        r={1.05}
                        fill={isStart ? '#e0a010' : '#2f9e5f'}
                        opacity={0.9}
                      />
                    )}
                  </g>
                );
              })}

            {model.kind !== 'breadboard' && showLabels && (
              <text
                x={model.body.w / 2}
                y={-2.4}
                fontSize={2.6}
                textAnchor="middle"
                className="wb-name"
              >
                {inst.name}
              </text>
            )}
            {inst.kind === 'part' && inst.value !== undefined && (
              <text
                x={model.body.w / 2}
                y={model.body.h + 3}
                fontSize={2}
                textAnchor="middle"
                className="wb-name"
              >
                {formatValue(inst.value, inst.unit)}
              </text>
            )}
          </g>
        );
      })}

      {/* Wires last so they sit above the boards. */}
      <g className="wb-wires">
        {workbench.wires.map((wire: BenchWire) => {
          const a = endpointPoint(wire.a, workbench, lookup),
            b = endpointPoint(wire.b, workbench, lookup);
          if (!a || !b) return null;
          const net = netOf(wire.a);
          const lit = highlightNet !== null && net === highlightNet;
          return (
            <g key={wire.id} data-wire-group={wire.id}>
              <path
                d={wirePath(a, b, wire.route)}
                fill="none"
                stroke={wire.color}
                strokeWidth={selectedWire === wire.id ? 1.5 : lit ? 1.25 : 0.95}
                strokeLinecap="round"
                opacity={highlightNet !== null && !lit ? 0.35 : 1}
              />
              <path
                d={wirePath(a, b, wire.route)}
                fill="none"
                stroke="transparent"
                strokeWidth={3}
                data-wire={wire.id}
                style={{ cursor: 'pointer' }}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  onSelectWire(wire.id);
                }}
              />
              {selectedWire === wire.id && (
                <>
                  {[a, b].map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={1.8}
                      fill="#f59e0b"
                      stroke="white"
                      strokeWidth={0.4}
                      onPointerDown={(ev) => {
                        ev.stopPropagation();
                        props.onRewire(wire.id, i === 0 ? 'a' : 'b');
                      }}
                    >
                      <title>Reconnect end {i === 0 ? 'A' : 'B'}</title>
                    </circle>
                  ))}
                  {wire.route.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={1.8}
                      fill="#0d9488"
                      stroke="white"
                      strokeWidth={0.4}
                      onPointerDown={(ev) => {
                        ev.stopPropagation();
                        bendDrag.current = { id: wire.id, index: i };
                        ev.currentTarget.setPointerCapture(ev.pointerId);
                      }}
                      onDoubleClick={(ev) => {
                        ev.stopPropagation();
                        props.onEditWire(wire.id, {
                          route: wire.route.filter((_, n) => n !== i),
                        });
                      }}
                    >
                      <title>Drag bend · double-click to remove</title>
                    </circle>
                  ))}
                </>
              )}
            </g>
          );
        })}
        {wireStartPoint && cursor && (
          <path
            d={wirePath(wireStartPoint, cursor)}
            fill="none"
            stroke="#e0a010"
            strokeWidth={1.1}
            strokeDasharray="2 1.4"
            strokeLinecap="round"
          />
        )}
      </g>
    </svg>
  );
}

export function fitView(w: Workbench, lookup: ModelLookup): View {
  const b = workbenchBounds(w, lookup);
  void b;
  return { x: 0, y: 0, scale: 1 };
}

export function focusView(
  inst: Instance,
  model: PhysicalModel,
  current: View,
): View {
  const p = localToTable(inst.transform, model.origin, {
    x: model.body.w / 2,
    y: model.body.h / 2,
  });
  return { x: p.x - 60, y: p.y - 40, scale: Math.max(current.scale, 2) };
}

export { HOLE_MAP, GROUP_HOLES };
