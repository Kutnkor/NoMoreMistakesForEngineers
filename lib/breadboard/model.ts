// Physical, rendering-independent 830-hole board. All lengths are millimetres.
export const PITCH = 2.54,
  WIDTH = 173.5,
  HEIGHT = 53.5;
export const ROWS = 'ABCDEFGHIJ'.split('');
export const RAILS = ['T+', 'T-', 'B+', 'B-'] as const;
export type Point = { x: number; y: number };
export type Hole = Point & {
  id: string;
  group: string;
  col: number;
  row: string;
};
export type PartType =
  | 'resistor'
  | 'capacitor_ceramic'
  | 'capacitor_electrolytic'
  | 'capacitor_film'
  | 'inductor'
  | 'ic_dip8'
  | 'wire';
export type Component = {
  ref: string;
  type: PartType;
  value?: number;
  unit?: string;
  tolerance?: number;
  part?: string;
  pins: string[] | Record<string, string>;
};
export type Circuit = {
  title: string;
  components: Component[];
  nets: string[];
  power?: { rails: string[]; vcc: number; vee: number };
};
export type Placement = {
  ref: string;
  pins: Record<string, string>;
  rotation: number;
};
export type Endpoint = {
  hole: string;
  attach?: { ref: string; pin: string; dx: number; dy: number };
};
export type Wire = {
  id: string;
  a: Endpoint;
  b: Endpoint;
  color: string;
  net?: string;
};
export type Port = { id: string; net: string; hole: string; label: string };
export type Layout = { parts: Record<string, Placement>; wires: Wire[] };
export type Issue = {
  kind:
    | 'missing'
    | 'short'
    | 'open'
    | 'wrong'
    | 'collision'
    | 'footprint'
    | 'rail';
  ref: string;
  pin: string;
  expected?: string;
  actual?: string;
  message: string;
};
export const HOLES: Hole[] = [];
for (let col = 1; col <= 63; col++)
  for (let i = 0; i < 10; i++)
    HOLES.push({
      id: `${col}-${ROWS[i]}`,
      col,
      row: ROWS[i],
      group: `${col}:${i < 5 ? 'AE' : 'FJ'}`,
      x: 8 + (col - 1) * PITCH,
      y: i < 5 ? 29.62 + (4 - i) * PITCH : 22 - (i - 5) * PITCH,
    });
for (const [r, row] of RAILS.entries())
  for (let col = 1; col <= 50; col++) {
    const k = (col - 1) % 25,
      m = col <= 25 ? 2 : 35,
      physicalCol = m + Math.floor(k / 5) * 6 + (k % 5);
    HOLES.push({
      id: `${col}-${row}`,
      col,
      row,
      group: `${row}:${col <= 25 ? 'L' : 'R'}`,
      x: 8 + (physicalCol - 1) * PITCH,
      y: [3.6, 6.14, 45.5, 48.04][r],
    });
  }
export const HOLE_MAP = new Map(HOLES.map((h) => [h.id, h]));
export const GROUP_HOLES = new Map<string, Hole[]>();
for (const h of HOLES) {
  const a = GROUP_HOLES.get(h.group) ?? [];
  a.push(h);
  GROUP_HOLES.set(h.group, a);
}
export const pinsOf = (c: Component): [string, string][] =>
  Array.isArray(c.pins)
    ? c.pins.map((n, i) => [String(i + 1), n])
    : Object.entries(c.pins).sort((a, b) => Number(a[0]) - Number(b[0]));
export const expectedPin = (ref: string, pin: string, net: string) =>
  net === 'NC' ? `NC@${ref}.${pin}` : net;
export function pointOf(id: string): Point {
  const h = HOLE_MAP.get(id);
  if (h) return { x: h.x, y: h.y };
  if (id.startsWith('!')) {
    const [x, y] = id.slice(1).split(':').map(Number);
    return { x, y };
  }
  return { x: -10, y: -10 };
}
export function nearestHole(p: Point) {
  let best = HOLES[0],
    d = Infinity;
  for (const h of HOLES) {
    const v = (h.x - p.x) ** 2 + (h.y - p.y) ** 2;
    if (v < d) {
      d = v;
      best = h;
    }
  }
  return best;
}
export function holeAt(p: Point) {
  const h = nearestHole(p);
  return Math.hypot(h.x - p.x, h.y - p.y) < 0.08
    ? h.id
    : `!${p.x.toFixed(3)}:${p.y.toFixed(3)}`;
}
export function endpointHole(e: Endpoint, l: Layout) {
  if (!e.attach) return e.hole;
  const p = l.parts[e.attach.ref]?.pins[e.attach.pin];
  if (!p) return '';
  const q = pointOf(p);
  return holeAt({ x: q.x + e.attach.dx, y: q.y + e.attach.dy });
}
export function translatePart(p: Placement, dx: number, dy: number): Placement {
  return {
    ...p,
    pins: Object.fromEntries(
      Object.entries(p.pins).map(([pin, h]) => {
        const q = pointOf(h);
        return [pin, holeAt({ x: q.x + dx, y: q.y + dy })];
      }),
    ),
  };
}
export function rotatePart(p: Placement): Placement {
  const origin = pointOf(p.pins['1']);
  return {
    ...p,
    rotation: (p.rotation + 90) % 360,
    pins: Object.fromEntries(
      Object.entries(p.pins).map(([pin, h]) => {
        const q = pointOf(h);
        return [
          pin,
          holeAt({
            x: origin.x - (q.y - origin.y),
            y: origin.y + (q.x - origin.x),
          }),
        ];
      }),
    ),
  };
}
export function snapMove(p: Placement, dx: number, dy: number) {
  const origin = pointOf(p.pins['1']),
    near = nearestHole({ x: origin.x + dx, y: origin.y + dy });
  return translatePart(p, near.x - origin.x, near.y - origin.y);
}
export class UnionFind {
  parent = new Map<string, string>();
  constructor(ids: Iterable<string>) {
    for (const id of ids) this.parent.set(id, id);
  }
  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined) throw Error('Unknown union-find member');
    if (p !== x) {
      const r = this.find(p);
      this.parent.set(x, r);
      return r;
    }
    return p;
  }
  union(a: string, b: string) {
    const x = this.find(a),
      y = this.find(b);
    if (x !== y) this.parent.set(y, x);
  }
}
export function parseCircuit(input: unknown): Circuit {
  if (!input || typeof input !== 'object')
    throw Error('The circuit must be a JSON object.');
  const c = input as Circuit;
  if (
    typeof c.title !== 'string' ||
    c.title.length > 140 ||
    !Array.isArray(c.nets) ||
    c.nets.length > 20 ||
    new Set(c.nets).size !== c.nets.length ||
    c.nets.some(
      (n) =>
        typeof n !== 'string' ||
        !n ||
        n.length > 30 ||
        ['NC', '__proto__', 'constructor', 'prototype'].includes(n),
    ) ||
    !Array.isArray(c.components) ||
    !c.components.length ||
    c.components.length > 32
  )
    throw Error(
      'Invalid circuit title, node list, or component count. Use 1–32 components.',
    );
  const refs = new Set<string>(),
    types: PartType[] = [
      'resistor',
      'capacitor_ceramic',
      'capacitor_electrolytic',
      'capacitor_film',
      'inductor',
      'ic_dip8',
      'wire',
    ];
  for (const part of c.components) {
    if (
      !part ||
      !types.includes(part.type) ||
      typeof part.ref !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(part.ref) ||
      refs.has(part.ref) ||
      ['constructor', 'prototype'].includes(part.ref)
    )
      throw Error('Invalid component type or duplicate reference.');
    refs.add(part.ref);
    if (!part.pins || typeof part.pins !== 'object')
      throw Error(part.ref + ': pin mapping is missing.');
    const pins = pinsOf(part);
    if (
      part.type === 'ic_dip8'
        ? pins.length !== 8 || pins.some(([pin], i) => pin !== String(i + 1))
        : !Array.isArray(part.pins) || pins.length !== 2
    )
      throw Error(
        part.ref +
          ': DIP-8 requires pins 1–8; other components require two pins.',
      );
    if (
      pins.some(
        ([, n]) => typeof n !== 'string' || (n !== 'NC' && !c.nets.includes(n)),
      )
    )
      throw Error(part.ref + ': undefined node.');
    if (
      !['ic_dip8', 'wire'].includes(part.type) &&
      (!Number.isFinite(part.value) || part.value! <= 0 || part.value! > 1e12)
    )
      throw Error(part.ref + ': a positive, finite value is required.');
    if (
      part.tolerance !== undefined &&
      (!Number.isFinite(part.tolerance) ||
        part.tolerance < 0 ||
        part.tolerance > 1)
    )
      throw Error(part.ref + ': tolerance must be between 0 and 1.');
    if (
      part.unit !== undefined &&
      (typeof part.unit !== 'string' || part.unit.length > 12)
    )
      throw Error('Invalid unit label.');
    if (
      part.part !== undefined &&
      (typeof part.part !== 'string' || part.part.length > 40)
    )
      throw Error('Invalid IC part number.');
  }
  if (
    c.power &&
    (!Array.isArray(c.power.rails) ||
      new Set(c.power.rails).size !== c.power.rails.length ||
      c.power.rails.some(
        (n) => !['VCC', 'VEE', 'GND'].includes(n) || !c.nets.includes(n),
      ) ||
      !Number.isFinite(c.power.vcc) ||
      !Number.isFinite(c.power.vee) ||
      c.power.vcc < 0 ||
      c.power.vee > 0)
  )
    throw Error('Invalid supply definition.');
  boardPlan(c);
  return structuredClone(c);
}
export const netColor = (n: string, c: Circuit) =>
  n === 'VCC'
    ? '#dc5149'
    : n === 'VEE'
      ? '#3775c4'
      : n === 'GND'
        ? '#293039'
        : ['#d6a30a', '#319c60', '#e37c2f', '#8c64be', '#169aaa'][
            Math.max(
              0,
              c.nets
                .filter((x) => !['VCC', 'VEE', 'GND'].includes(x))
                .indexOf(n),
            ) % 5
          ];
export function boardPlan(c: Circuit) {
  const ics = c.components.filter((p) => p.type === 'ic_dip8'),
    icStarts = Object.fromEntries(
      ics.map((p, i) => [
        p.ref,
        Math.round(30 + (i - (ics.length - 1) / 2) * 12),
      ]),
    );
  if (ics.length > 4)
    throw Error('This placer supports up to four DIP-8 packages.');
  const reserved = new Set(
    Object.values(icStarts).flatMap((col) => [col, col + 1, col + 2, col + 3]),
  );
  const signals = c.nets.filter((n) => !['VCC', 'VEE', 'GND'].includes(n));
  const cols = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60].filter(
    (n) => !reserved.has(n),
  );
  if (signals.length > cols.length)
    throw Error(
      'There is not enough allocated space on this board for the signal nodes.',
    );
  const hubs: Record<string, string> = {};
  signals.forEach((n, i) => (hubs[n] = `${cols[i]}:AE`));
  const ports: Port[] = [];
  for (const n of ['VCC', 'GND', 'VEE'])
    if (c.nets.includes(n)) {
      const rail = n === 'VCC' ? 'T+' : n === 'VEE' ? 'B-' : 'T-';
      hubs[n] = `${rail}:L`;
      for (const side of ['L', 'R'])
        ports.push({
          id: `${n}-${side}`,
          net: n,
          hole: `${side === 'L' ? 1 : 50}-${rail}`,
          label: `${n} ${side === 'L' ? 'left' : 'right'}`,
        });
    }
  for (const n of signals.filter((n) => n === 'IN' || n === 'OUT'))
    ports.push({
      id: n,
      net: n,
      hole: `${cols[signals.indexOf(n)]}-A`,
      label: n,
    });
  return { hubs, ports, icStarts };
}
// Reconstruct connectivity from copper groups and physical jumper endpoints ONLY.
// Component net names never cause a union in the board graph.
export function extractBoard(c: Circuit, l: Layout) {
  const uf = new UnionFind(HOLES.map((h) => h.id));
  for (const holes of GROUP_HOLES.values())
    for (const h of holes.slice(1)) uf.union(holes[0].id, h.id);
  for (const w of l.wires) {
    const a = endpointHole(w.a, l),
      b = endpointHole(w.b, l);
    if (HOLE_MAP.has(a) && HOLE_MAP.has(b)) uf.union(a, b);
  }
  for (const p of c.components.filter((p) => p.type === 'wire')) {
    const a = l.parts[p.ref]?.pins['1'],
      b = l.parts[p.ref]?.pins['2'];
    if (HOLE_MAP.has(a) && HOLE_MAP.has(b)) uf.union(a, b);
  }
  const holeToNet = new Map(HOLES.map((h) => [h.id, uf.find(h.id)]));
  const terminals: {
    ref: string;
    pin: string;
    hole: string;
    actual: string | null;
    expected: string;
    port: boolean;
  }[] = [];
  for (const p of c.components)
    for (const [pin, net] of pinsOf(p)) {
      const h = l.parts[p.ref]?.pins[pin] ?? '';
      terminals.push({
        ref: p.ref,
        pin,
        hole: h,
        actual: holeToNet.get(h) ?? null,
        expected: expectedPin(p.ref, pin, net),
        port: false,
      });
    }
  for (const p of boardPlan(c).ports)
    terminals.push({
      ref: 'J_' + p.id,
      pin: '1',
      hole: p.hole,
      actual: holeToNet.get(p.hole)!,
      expected: p.net,
      port: true,
    });
  return {
    holeToNet,
    terminals,
    netlist: c.components.map((p) => ({
      ref: p.ref,
      type: p.type,
      pins: Object.fromEntries(
        terminals.filter((t) => t.ref === p.ref).map((t) => [t.pin, t.actual]),
      ),
    })),
  };
}
export function validateLayout(c: Circuit, l: Layout) {
  const graph = extractBoard(c, l),
    issues: Issue[] = [],
    occupants = new Map<string, { ref: string; pin: string }[]>();
  const occupy = (hole: string, ref: string, pin: string) => {
    if (!HOLE_MAP.has(hole)) {
      issues.push({
        kind: 'missing',
        ref,
        pin,
        message: `${ref}.${pin}: ${hole ? 'pin does not align with a hole.' : 'has not been placed yet.'}`,
      });
      return;
    }
    const a = occupants.get(hole) ?? [];
    a.push({ ref, pin });
    occupants.set(hole, a);
  };
  for (const t of graph.terminals) occupy(t.hole, t.ref, t.pin);
  for (const w of l.wires) {
    occupy(endpointHole(w.a, l), w.id, '1');
    occupy(endpointHole(w.b, l), w.id, '2');
  }
  for (const [hole, a] of occupants)
    if (a.length > 1)
      for (const x of a)
        issues.push({
          kind: 'collision',
          ...x,
          message: `${x.ref}.${x.pin}: hole ${hole} is shared with ${a
            .filter((y) => y !== x)
            .map((y) => `${y.ref}.${y.pin}`)
            .join(', ')}.`,
        });
  const target = new UnionFind([
    ...c.nets,
    ...graph.terminals
      .filter((t) => t.expected.startsWith('NC@'))
      .map((t) => t.expected),
  ]);
  for (const p of c.components.filter((p) => p.type === 'wire')) {
    const pp = pinsOf(p);
    target.union(
      expectedPin(p.ref, '1', pp[0][1]),
      expectedPin(p.ref, '2', pp[1][1]),
    );
  }
  const byActual = new Map<string, typeof graph.terminals>(),
    byExpected = new Map<string, typeof graph.terminals>();
  for (const t of graph.terminals) {
    const e = target.find(t.expected),
      g = byExpected.get(e) ?? [];
    g.push(t);
    byExpected.set(e, g);
    if (t.actual) {
      const a = byActual.get(t.actual) ?? [];
      a.push(t);
      byActual.set(t.actual, a);
    }
  }
  for (const terminals of byActual.values()) {
    const nets = [...new Set(terminals.map((t) => target.find(t.expected)))];
    if (nets.length <= 1) continue;
    for (const t of terminals) {
      const other = terminals.filter(
        (x) => x !== t && target.find(x.expected) !== target.find(t.expected),
      );
      if (!other.length) continue;
      const actual = [
        ...new Set(other.map((x) => x.expected.replace(/^NC@/, 'NC '))),
      ].join(' / ');
      issues.push({
        kind: t.port ? 'short' : 'wrong',
        ref: t.ref,
        pin: t.pin,
        expected: t.expected,
        actual,
        message: `${t.ref}.${t.pin}: expected ${t.expected}, but connected to ${actual} at ${t.hole}; short circuit / incorrect connection.`,
      });
    }
  }
  for (const terminals of byExpected.values()) {
    const present = terminals.filter((t) => t.actual),
      groups = new Set(present.map((t) => t.actual));
    if (groups.size <= 1) continue;
    const anchor =
      present.find((t) => t.port && t.ref.endsWith('-L')) ??
      present.find((t) => t.port) ??
      present.reduce((a, b) =>
        present.filter((t) => t.actual === a.actual).length >=
        present.filter((t) => t.actual === b.actual).length
          ? a
          : b,
      );
    for (const t of present.filter((t) => t.actual !== anchor.actual)) {
      const kind = t.port && t.ref.endsWith('-R') ? 'rail' : 'open';
      issues.push({
        kind,
        ref: t.ref,
        pin: t.pin,
        expected: t.expected,
        message:
          kind === 'rail'
            ? `${t.ref}.${t.pin}: ${t.expected} rail's right half is not connected to its left half; the center bridge is missing (${t.hole}).`
            : `${t.ref}.${t.pin}: ${t.expected} connection is open; hole ${t.hole} is not connected to ${anchor.ref}.${anchor.pin}.`,
      });
    }
  }
  for (const p of c.components) {
    const at = l.parts[p.ref];
    if (!at) continue;
    if (p.type === 'ic_dip8') {
      const hs = pinsOf(p).map(([pin]) => HOLE_MAP.get(at.pins[pin]));
      const physical = (side: string, other: string, dir: number) =>
        hs.every(Boolean) &&
        hs
          .slice(0, 4)
          .every(
            (h, i) => h!.row === side && h!.col === hs[0]!.col + dir * i,
          ) &&
        hs
          .slice(4)
          .every(
            (h, i) => h!.row === other && h!.col === hs[0]!.col + dir * (3 - i),
          );
      const valid = at.rotation % 360 === 0 && physical('E', 'F', 1);
      const reversed = at.rotation % 360 === 180 && physical('F', 'E', -1);
      if (!valid && !reversed)
        issues.push({
          kind: 'footprint',
          ref: p.ref,
          pin: '1',
          message: `${p.ref}.1: DIP-8 does not straddle the center channel; check rows E/F and the pin-1 orientation.`,
        });
    }
  }
  const warnings = c.components
    .filter(
      (p) =>
        p.type === 'ic_dip8' &&
        p.part?.toUpperCase().startsWith('TL072') &&
        pinsOf(p).some(([, n]) =>
          ['NC', '__proto__', 'constructor', 'prototype'].includes(n),
        ),
    )
    .map(
      (p) =>
        `${p.ref}.5/6/7: the unused TL072 channel is left NC. A physical build needs termination and supply bypass capacitors as specified in the datasheet.`,
    );
  return { valid: issues.length === 0, issues, warnings, ...graph };
}
export function emptyLayout(): Layout {
  return { parts: {}, wires: [] };
}

export function autoPlace(c: Circuit): Layout {
  const { hubs, ports, icStarts } = boardPlan(c),
    l = emptyLayout(),
    used = new Set(ports.map((p) => p.hole)),
    owner = new Map<string, string>(),
    bodies = new Map<string, [number, number][]>();
  const components = new Map(c.components.map((p) => [p.ref, p]));
  for (const [n, g] of Object.entries(hubs)) owner.set(g, n);
  for (const p of ports) owner.set(HOLE_MAP.get(p.hole)!.group, p.net);
  const occupy = (p: Placement) => {
    l.parts[p.ref] = p;
    for (const [pin, h] of Object.entries(p.pins)) {
      if (used.has(h)) throw Error('Hole collision in layout: ' + h);
      used.add(h);
      const c = components.get(p.ref)!,
        n = pinsOf(c).find((x) => x[0] === pin)![1];
      owner.set(HOLE_MAP.get(h)!.group, expectedPin(p.ref, pin, n));
    }
  };
  for (const p of c.components.filter((p) => p.type === 'ic_dip8')) {
    const col = icStarts[p.ref];
    occupy({
      ref: p.ref,
      rotation: 0,
      pins: Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [
          String(i + 1),
          i < 4 ? `${col + i}-E` : `${col + 7 - i}-F`,
        ]),
      ),
    });
  }
  const free = (id: string, net: string) => {
    const h = HOLE_MAP.get(id);
    return (
      h &&
      !used.has(id) &&
      (!owner.has(h.group) || owner.get(h.group) === net) &&
      GROUP_HOLES.get(h.group)!.filter((x) => used.has(x.id)).length < 4
    );
  };
  for (const p of c.components.filter((p) => p.type !== 'ic_dip8')) {
    const entries = pinsOf(p),
      nets = entries.map(([pin, n]) => expectedPin(p.ref, pin, n));
    const cols = nets.map((n) =>
      hubs[n]?.endsWith(':AE') ? Number(hubs[n].split(':')[0]) : null,
    );
    const options: [number, number, string][] = [];
    if (
      cols[0] !== null &&
      cols[1] !== null &&
      Math.abs(cols[1] - cols[0]) >= 3 &&
      Math.abs(cols[1] - cols[0]) <= 12
    )
      for (const row of ['B', 'D', 'A', 'C'])
        options.push([cols[0], cols[1], row]);
    for (const row of ['C', 'A', 'H', 'J', 'B', 'I', 'D', 'G'])
      for (const start of new Set([
        ...(cols[0] ? [cols[0]] : []),
        ...Array.from({ length: 58 }, (_, i) => i + 3),
      ]))
        for (const span of [3, 4, 5, 6, -3, -4])
          options.push([start, start + span, row]);
    let found = false;
    for (const [a, b, row] of options) {
      if (!free(`${a}-${row}`, nets[0]) || !free(`${b}-${row}`, nets[1]))
        continue;
      const interval: [number, number] = [
          Math.min(a, b) - 0.7,
          Math.max(a, b) + 0.7,
        ],
        existing = bodies.get(row) ?? [];
      if (existing.some(([x, y]) => interval[0] < y && interval[1] > x))
        continue;
      occupy({
        ref: p.ref,
        rotation: 0,
        pins: { '1': `${a}-${row}`, '2': `${b}-${row}` },
      });
      existing.push(interval);
      bodies.set(row, existing);
      found = true;
      break;
    }
    if (!found)
      throw Error(p.ref + ': no collision-free pin spacing was found.');
  }
  const sites = new Map<string, Set<string>>();
  for (const [g, n] of owner) {
    if (n.startsWith('NC@')) continue;
    const s = sites.get(n) ?? new Set();
    s.add(g);
    sites.set(n, s);
  }
  const avail = (g: string) =>
    GROUP_HOLES.get(g)!.filter((h) => !used.has(h.id));
  const attach = (h: Hole): Endpoint => {
    for (const p of Object.values(l.parts))
      for (const [pin, id] of Object.entries(p.pins)) {
        const a = HOLE_MAP.get(id)!;
        if (a.group === h.group)
          return {
            hole: h.id,
            attach: { ref: p.ref, pin, dx: h.x - a.x, dy: h.y - a.y },
          };
      }
    return { hole: h.id };
  };
  const wire = (a: Hole, b: Hole, n: string) => {
    used.add(a.id);
    used.add(b.id);
    l.wires.push({
      id: 'W' + (l.wires.length + 1),
      a: attach(a),
      b: attach(b),
      color: netColor(n, c),
      net: n,
    });
  };
  for (const [n, nodes] of sites) {
    const all = [...nodes].sort((a, b) =>
        a === hubs[n]
          ? -1
          : b === hubs[n]
            ? 1
            : avail(b).length - avail(a).length,
      ),
      network = [all.shift()!];
    for (const next of all) {
      let free = network.flatMap(avail);
      if (free.length <= 1) {
        const extra = [...GROUP_HOLES.keys()].find(
          (g) => g.includes(':AE') && !owner.has(g),
        );
        if (!extra || !free.length)
          throw Error(
            n + ': no free hole is available for jumper distribution.',
          );
        owner.set(extra, n);
        wire(free[0], avail(extra)[0], n);
        network.push(extra);
        free = network.flatMap(avail);
      }
      const end = avail(next)[0];
      if (!end)
        throw Error(n + ': could not connect a jumper to the occupied column.');
      wire(free[0], end, n);
      network.push(next);
    }
  }
  const result = validateLayout(c, l);
  if (!result.valid)
    throw Error(
      'Could not validate the automatic layout: ' +
        result.issues
          .slice(0, 3)
          .map((i) => i.message)
          .join(' '),
    );
  return l;
}
export function holeDescription(id: string) {
  const h = HOLE_MAP.get(id);
  if (!h) return 'outside the board';
  return RAILS.includes(h.row as (typeof RAILS)[number])
    ? `${h.row} rail, hole ${h.col} (${h.col <= 25 ? 'left' : 'right'} half)`
    : `column ${h.col}, row ${h.row} (${ROWS.indexOf(h.row) < 5 ? 'A–E lower' : 'F–J upper'} half)`;
}
export function assemblyList(c: Circuit, l: Layout) {
  const v = validateLayout(c, l);
  return [
    `${c.title} — 830-hole breadboard`,
    v.valid
      ? 'Connections match the target netlist.'
      : 'INCOMPLETE / INCORRECT ASSEMBLY',
    c.nets.some((net) => net === 'VCC' || net === 'VEE')
      ? `Supply: VCC ${c.power?.vcc ?? 0} V; VEE ${c.power?.vee ?? 0} V; common GND 0 V.`
      : 'No separate DC supply; connect the input source reference to GND.',
    ...boardPlan(c).ports.map(
      (p) =>
        `${p.id.endsWith('-R') ? 'Rail continuity checkpoint (do not connect a separate supply)' : 'External connection'} ${p.net}: ${p.hole} — ${holeDescription(p.hole)}.`,
    ),
    ...c.components.map(
      (p) =>
        `${p.ref} ${p.part ?? (p.value === undefined ? p.type : formatValue(p))}: ${pinsOf(
          p,
        )
          .map(
            ([pin, n]) =>
              `pin ${pin}${p.type === 'capacitor_electrolytic' ? (pin === '1' ? ' (+)' : ' (−)') : ''} → ${l.parts[p.ref]?.pins[pin] ?? 'in tray'} (${n})`,
          )
          .join('; ')}.`,
    ),
    ...l.wires.map(
      (w) =>
        `${w.id} jumper ${w.net ?? 'manually added'}: ${endpointHole(w.a, l)} → ${endpointHole(w.b, l)}. ${holeDescription(endpointHole(w.a, l))} → ${holeDescription(endpointHole(w.b, l))}.`,
    ),
    ...v.issues.map((i) => 'ERROR: ' + i.message),
    ...v.warnings.map((w) => 'NOTE: ' + w),
    'This list describes electrical connections. Matching the schematic does not validate analog performance or physical hardware. Check pin numbers from the top view. Verify power-rail splits on the actual board with a continuity measurement.',
  ].join('\n');
}
const COLORS = [
  '#202325',
  '#764a34',
  '#d44d43',
  '#e58832',
  '#e7c442',
  '#3b8853',
  '#366b9f',
  '#825497',
  '#93989b',
  '#f3f3ed',
];
export function resistorBands(value: number, tolerance = 0.05) {
  if (!Number.isFinite(value) || value <= 0)
    throw Error('Invalid resistance value.');
  let exponent = Math.floor(Math.log10(value)) - 1,
    digits = Math.round(value / 10 ** exponent);
  if (digits === 100) {
    digits = 10;
    exponent++;
  }
  if (
    exponent < -2 ||
    exponent > 9 ||
    Math.abs(digits * 10 ** exponent - value) > value * 1e-8
  )
    throw Error('This value cannot be represented exactly with four bands.');
  const tolerances: Record<string, string> = {
    '0.01': '#764a34',
    '0.02': '#d44d43',
    '0.005': '#3b8853',
    '0.0025': '#366b9f',
    '0.001': '#825497',
    '0.0005': '#93989b',
    '0.05': '#b69b4b',
    '0.1': '#b2b5b8',
    '0.2': 'transparent',
  };
  if (!tolerances[String(tolerance)])
    throw Error('This tolerance has no four-band representation.');
  return {
    digits: [Math.floor(digits / 10), digits % 10],
    exponent,
    representedValue: digits * 10 ** exponent,
    colors: [
      COLORS[Math.floor(digits / 10)],
      COLORS[digits % 10],
      exponent === -1
        ? '#b69b4b'
        : exponent === -2
          ? '#b2b5b8'
          : COLORS[exponent],
      tolerances[String(tolerance)],
    ],
  };
}
export function capacitorCode(farads: number) {
  const pf = farads * 1e12;
  if (!Number.isFinite(pf) || pf <= 0) throw Error('Invalid capacitance.');
  let exponent = Math.floor(Math.log10(pf)) - 1,
    digits = Math.round(pf / 10 ** exponent);
  if (digits === 100) {
    digits = 10;
    exponent++;
  }
  if (
    exponent < 0 ||
    exponent > 9 ||
    Math.abs(digits * 10 ** exponent - pf) > pf * 1e-8
  )
    return (
      pf.toLocaleString('en-US', {
        useGrouping: false,
        maximumFractionDigits: 3,
      }) + 'p'
    );
  return String(digits) + exponent;
}
export function formatValue(p: Component) {
  const v = p.value ?? 0;
  if (p.type === 'resistor')
    return v >= 1e6
      ? `${+(v / 1e6).toPrecision(3)} MΩ`
      : v >= 1e3
        ? `${+(v / 1e3).toPrecision(3)} kΩ`
        : `${v} Ω`;
  if (p.type === 'inductor') return `${+(v * 1e3).toPrecision(3)} mH`;
  if (p.type.startsWith('capacitor'))
    return v >= 1e-6
      ? `${+(v * 1e6).toPrecision(3)} µF`
      : v >= 1e-9
        ? `${+(v * 1e9).toPrecision(3)} nF`
        : `${+(v * 1e12).toPrecision(3)} pF`;
  return p.part ?? p.type;
}
