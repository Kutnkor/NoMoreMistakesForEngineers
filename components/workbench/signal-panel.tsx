/* oxlint-disable jsx-a11y/prefer-tag-over-role -- SVG provides the accessible waveform graphic. */
'use client';
import { useState } from 'react';
import type { RuntimeFrame } from '@/lib/workbench/runtime/circuit';
export function SignalPanel({
  frame,
  pin,
  onPin,
}: {
  frame: RuntimeFrame;
  pin: number;
  onPin: (p: number) => void;
}) {
  const [windowMs, setWindow] = useState(20),
    [held, setHeld] = useState<RuntimeFrame | null>(null);
  const f = held ?? frame,
    end = f.milliseconds,
    start = Math.max(
      0,
      end - windowMs,
      f.traceDropped ? (f.traces?.[0]?.at ?? end) : 0,
    ),
    width = Math.max(0.001, end - start);
  const all = f.traces ?? [],
    events = all.filter((e) => e.pin === pin),
    points = events.filter((e) => e.at >= start && e.at <= end);
  // Infer the level before the first retained transition, or use the final pin level if unchanged.
  let level =
    events.filter((e) => e.at < start).at(-1)?.value ??
    (points.length ? 1 - points[0].value : (f.pins[pin] ?? 0));
  let path = `M0 ${level ? 22 : 72}`;
  for (const e of points) {
    const x = ((e.at - start) / width) * 800;
    path += ` H${x} V${e.value ? 22 : 72}`;
    level = e.value;
  }
  path += ' H800';
  const rises = points.filter((e) => e.value === 1),
    period =
      rises.length > 1
        ? (rises.at(-1)!.at - rises[0].at) / (rises.length - 1)
        : null;
  return (
    <section className="wb-signals" aria-label="Digital signal analyzer">
      <div className="wb-panel-head">
        <b>Digital signals</b>
        <select
          aria-label="Measured Arduino pin"
          value={pin}
          onChange={(e) => onPin(Number(e.target.value))}
        >
          {Array.from({ length: 20 }, (_, p) => (
            <option key={p} value={p}>
              {p < 14 ? 'D' + p : 'A' + (p - 14)}
            </option>
          ))}
        </select>
        <select
          aria-label="Signal time window"
          value={windowMs}
          onChange={(e) => setWindow(Number(e.target.value))}
        >
          {[5, 20, 100, 500].map((n) => (
            <option key={n} value={n}>
              {n} ms
            </option>
          ))}
        </select>
        <button onClick={() => setHeld(held ? null : structuredClone(frame))}>
          {held ? 'Resume trace' : 'Freeze trace'}
        </button>
      </div>
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Inline SVG is the accessible waveform image. */}
      <svg
        viewBox="0 0 800 95"
        role="img"
        aria-label={`Digital waveform for pin ${pin}`}
      >
        <path d="M0 22H800M0 72H800" stroke="#d7e2e8" />
        <path d={path} fill="none" stroke="#009eaa" strokeWidth="2" />
        <text x="4" y="15" fontSize="12" fill="currentColor">
          HIGH
        </text>
        <text x="4" y="91" fontSize="12" fill="currentColor">
          LOW
        </text>
      </svg>
      <p>
        {start.toFixed(2)}–{end.toFixed(2)} ms simulated ·{' '}
        {(100 * (f.duties?.[pin] ?? 0)).toFixed(1)}% HIGH in last frame ·{' '}
        {period
          ? `${(1000 / period).toFixed(1)} Hz across captured pulses`
          : 'More pulses needed for frequency'}
      </p>
      <small>
        {f.running
          ? 'Click a controller pin with Probe to inspect it here.'
          : 'Run a supported circuit to capture transitions.'}{' '}
        {f.traceDropped
          ? 'Capture buffer rolled over; older transitions are unavailable.'
          : ''}{' '}
        Digital logic levels only; no analog voltage/current measurement.
      </small>
    </section>
  );
}
