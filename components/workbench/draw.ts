// Shared drawing data for the 2D and 3D workbench views.
import type { PhysicalModel, PinType } from '@/lib/workbench/physical';

export const WIRE_COLORS = [
  { id: '#22262b', name: 'Black' },
  { id: '#d0342c', name: 'Red' },
  { id: '#2f6fd0', name: 'Blue' },
  { id: '#e0a010', name: 'Yellow' },
  { id: '#2f9e5f', name: 'Green' },
  { id: '#8c5bd0', name: 'Violet' },
  { id: '#e0722c', name: 'Orange' },
  { id: '#7a8894', name: 'Grey' },
];

/** Colour is a convenience only; it never decides what a wire does. */
export const suggestedColor = (label: string) =>
  /^(gnd|agnd)$/i.test(label)
    ? '#22262b'
    : /^(5v|3v3|3\.3v|vbus|vsys|vcc|vin)$/i.test(label)
      ? '#d0342c'
      : '#2f6fd0';

export const PIN_TINT: Record<PinType, string> = {
  ground: '#4b5560',
  power_out: '#d0342c',
  power_in: '#b4562c',
  gpio: '#2f7d8c',
  analog_in: '#7a5bd0',
  reset: '#c08a10',
  reference: '#8a7a4a',
  passive: '#6b7480',
  nc: '#9aa3ad',
  other: '#6b7480',
};

const BAND = [
  '#1b1b1b',
  '#7b4a1e',
  '#c8352b',
  '#e07a20',
  '#e0c419',
  '#3f9e4d',
  '#2f6fd0',
  '#8c5bd0',
  '#8d8d8d',
  '#f2f2f2',
];

/** Four-band code computed from the value; never a stored picture. */
export function resistorBands(ohms: number, tolerance = 0.05): string[] {
  if (!Number.isFinite(ohms) || ohms <= 0)
    return ['#8d8d8d', '#8d8d8d', '#8d8d8d', '#c9a227'];
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let mant = Math.round(ohms / 10 ** exp);
  if (mant >= 100) {
    mant = Math.round(mant / 10);
    exp += 1;
  }
  const d1 = Math.floor(mant / 10),
    d2 = mant % 10;
  const tol =
    tolerance <= 0.001
      ? '#8c5bd0'
      : tolerance <= 0.01
        ? '#7b4a1e'
        : tolerance <= 0.02
          ? '#c8352b'
          : '#c9a227';
  return [
    BAND[d1] ?? '#8d8d8d',
    BAND[d2] ?? '#8d8d8d',
    BAND[Math.max(0, Math.min(9, exp))] ?? '#8d8d8d',
    tol,
  ];
}

/** Three-digit ceramic code in picofarads: 100 nF -> 104. */
export function capacitorCode(farads: number): string {
  if (!Number.isFinite(farads) || farads <= 0) return '---';
  const pf = farads * 1e12;
  if (pf < 100) return String(Math.round(pf));
  const exp = Math.floor(Math.log10(pf)) - 1;
  const mant = Math.round(pf / 10 ** exp);
  return `${Math.min(99, mant)}${Math.max(0, Math.min(9, exp))}`;
}

export function formatValue(v: number | undefined, unit: string | undefined) {
  if (!Number.isFinite(v as number)) return '';
  const x = v as number;
  const table: [number, string][] =
    unit === 'F'
      ? [
          [1e-12, 'pF'],
          [1e-9, 'nF'],
          [1e-6, 'µF'],
          [1e-3, 'mF'],
        ]
      : unit === 'H'
        ? [
            [1e-6, 'µH'],
            [1e-3, 'mH'],
            [1, 'H'],
          ]
        : [
            [1, 'Ω'],
            [1e3, 'kΩ'],
            [1e6, 'MΩ'],
          ];
  let best = table[0];
  for (const t of table) if (x >= t[0]) best = t;
  const n = x / best[0];
  return `${n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2).replace(/\.?0+$/, '')} ${best[1]}`;
}

/** Gentle S-curve for a jumper on the table plane. */
export function wirePath(
  a: { x: number; y: number },
  b: { x: number; y: number },
  route: { x: number; y: number }[] = [],
) {
  const pts = [a, ...route, b];
  if (pts.length === 2) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      d = Math.hypot(dx, dy) || 1,
      lift = Math.min(14, d * 0.28),
      nx = -dy / d,
      ny = dx / d;
    return `M ${a.x} ${a.y} C ${a.x + dx * 0.25 + nx * lift} ${a.y + dy * 0.25 + ny * lift}, ${
      a.x + dx * 0.75 + nx * lift
    } ${a.y + dy * 0.75 + ny * lift}, ${b.x} ${b.y}`;
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1],
      q = pts[i];
    d += ` Q ${(p.x + q.x) / 2} ${(p.y + q.y) / 2}, ${q.x} ${q.y}`;
  }
  return d;
}

export const modelAccent = (m: PhysicalModel) =>
  m.kind === 'breadboard'
    ? '#c9c2b0'
    : m.kind === 'board'
      ? '#0f8b93'
      : '#7a8894';
