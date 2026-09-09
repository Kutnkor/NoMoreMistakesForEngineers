// Workbench connectivity.
//
// Rules that this module exists to enforce:
//   * Copper decides, labels do not. Two boards that both print "GND" are NOT
//     connected unless a modelled conductor joins them.
//   * A split power rail stays split until a bridge wire joins the halves.
//   * A resistor is not a wire: a two-lead part never merges its own two nodes.
//     Only jumper wires and documented internal board nets create a union.
//   * Crossing wires on screen create nothing.
import { GROUP_HOLES, HOLE_MAP, UnionFind } from '../breadboard/model.ts';
import type { PhysicalModel } from './physical.ts';
import type {
  ConnectionEndpoint,
  Instance,
  ModelLookup,
  Workbench,
} from './types.ts';

export type NodeKey = string;

export const holeNode = (
  instanceId: string,
  holeId: string,
): NodeKey | null => {
  const h = HOLE_MAP.get(holeId);
  return h ? `bb:${instanceId}:${h.group}` : null;
};

export const pinNode = (instanceId: string, pinId: string): NodeKey =>
  `pin:${instanceId}:${pinId}`;

export function nodeKeyOf(e: ConnectionEndpoint): NodeKey | null {
  return e.kind === 'breadboard-hole'
    ? holeNode(e.instanceId, e.holeId)
    : pinNode(e.instanceId, e.pinId);
}

export type Connectivity = {
  uf: UnionFind;
  /** Every conductive node that exists on this workbench. */
  nodes: NodeKey[];
  /** root -> nodes in that electrical net. */
  nets: Map<NodeKey, NodeKey[]>;
  netOf: (e: ConnectionEndpoint) => NodeKey | null;
  connected: (a: ConnectionEndpoint, b: ConnectionEndpoint) => boolean;
};

export function buildConnectivity(
  w: Workbench,
  lookup: ModelLookup,
): Connectivity {
  const nodes: NodeKey[] = [];

  for (const inst of w.instances) {
    const model = lookup(inst.modelId);
    if (!model) continue;
    if (model.kind === 'breadboard')
      for (const group of GROUP_HOLES.keys())
        nodes.push(`bb:${inst.id}:${group}`);
    for (const p of model.pins) nodes.push(pinNode(inst.id, p.id));
  }

  const uf = new UnionFind(nodes);
  const has = new Set(nodes);
  const join = (a: NodeKey | null, b: NodeKey | null) => {
    if (a && b && has.has(a) && has.has(b)) uf.union(a, b);
  };

  // 1) Documented internal connections inside a single product.
  for (const inst of w.instances) {
    const model = lookup(inst.modelId);
    if (!model?.internalNets) continue;
    for (const net of model.internalNets)
      for (let i = 1; i < net.pins.length; i++)
        join(pinNode(inst.id, net.pins[0]), pinNode(inst.id, net.pins[i]));
  }

  // 2) A board or part plugged into a breadboard: each pin joins its hole's strip.
  for (const inst of w.instances) {
    if (!inst.mounted) continue;
    for (const [pinId, holeId] of Object.entries(inst.mounted.pins))
      join(
        pinNode(inst.id, pinId),
        holeNode(inst.mounted.boardInstanceId, holeId),
      );
  }

  // 3) Jumper wires drawn by the user.
  for (const wire of w.wires) join(nodeKeyOf(wire.a), nodeKeyOf(wire.b));

  const nets = new Map<NodeKey, NodeKey[]>();
  for (const n of nodes) {
    const r = uf.find(n);
    const g = nets.get(r) ?? [];
    g.push(n);
    nets.set(r, g);
  }

  const netOf = (e: ConnectionEndpoint) => {
    const k = nodeKeyOf(e);
    return k && has.has(k) ? uf.find(k) : null;
  };

  return {
    uf,
    nodes,
    nets,
    netOf,
    connected: (a, b) => {
      const x = netOf(a),
        y = netOf(b);
      return x !== null && x === y;
    },
  };
}

// ---------------------------------------------------------------------------
// Human-readable descriptions
// ---------------------------------------------------------------------------
const RAIL_NAMES: Record<string, string> = {
  'T+': 'Top + rail',
  'T-': 'Top − rail',
  'B+': 'Bottom + rail',
  'B-': 'Bottom − rail',
};

export function describeHole(holeId: string) {
  const h = HOLE_MAP.get(holeId);
  if (!h) return holeId;
  const rail = RAIL_NAMES[h.row];
  if (rail) return `${rail} · hole ${h.col}`;
  return `row ${h.row} · column ${h.col}`;
}

export function describeEndpoint(
  e: ConnectionEndpoint,
  w: Workbench,
  lookup: ModelLookup,
): string {
  const inst = w.instances.find((i) => i.id === e.instanceId);
  if (!inst) return 'missing object';
  if (e.kind === 'breadboard-hole')
    return `${inst.name} · ${describeHole(e.holeId)}`;
  const model = lookup(inst.modelId);
  const pin = model?.pins.find((p) => p.id === e.pinId);
  if (!pin) return `${inst.name} · unknown pin ${e.pinId}`;
  return `${inst.name} · ${pin.group} · ${pin.label}`;
}

export const describeWire = (
  wire: { a: ConnectionEndpoint; b: ConnectionEndpoint },
  w: Workbench,
  lookup: ModelLookup,
) =>
  `${describeEndpoint(wire.a, w, lookup)} → ${describeEndpoint(wire.b, w, lookup)}`;

// ---------------------------------------------------------------------------
// Checks that can actually be derived from pin metadata
// ---------------------------------------------------------------------------
export type BenchIssue = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  text: string;
  wireId?: string;
  instanceId?: string;
  pinId?: string;
};

type PinRef = {
  inst: Instance;
  model: PhysicalModel;
  pin: PhysicalModel['pins'][number];
};

export function analyzeWorkbench(
  w: Workbench,
  lookup: ModelLookup,
): BenchIssue[] {
  const issues: BenchIssue[] = [];
  const conn = buildConnectivity(w, lookup);

  // Dangling endpoints: never silently repair them.
  for (const wire of w.wires) {
    for (const [side, e] of [
      ['A', wire.a],
      ['B', wire.b],
    ] as const) {
      const inst = w.instances.find((i) => i.id === e.instanceId);
      const model = inst && lookup(inst.modelId);
      const ok =
        inst &&
        model &&
        (e.kind === 'breadboard-hole'
          ? model.kind === 'breadboard' && HOLE_MAP.has(e.holeId)
          : model.pins.some((p) => p.id === e.pinId));
      if (!ok)
        issues.push({
          severity: 'error',
          code: 'dangling-endpoint',
          wireId: wire.id,
          text: `Wire ${wire.label ?? wire.id}: end ${side} no longer resolves to a real connection point.`,
        });
    }
  }

  // Collect pins by electrical net.
  const pinsByNet = new Map<string, PinRef[]>();
  for (const inst of w.instances) {
    const model = lookup(inst.modelId);
    if (!model) continue;
    for (const pin of model.pins) {
      const net = conn.netOf({
        kind: 'board-pin',
        instanceId: inst.id,
        pinId: pin.id,
      });
      if (!net) continue;
      const g = pinsByNet.get(net) ?? [];
      g.push({ inst, model, pin });
      pinsByNet.set(net, g);
    }
  }

  for (const [, refs] of pinsByNet) {
    const grounds = refs.filter((r) => r.pin.type === 'ground');
    const supplies = refs.filter(
      (r) =>
        r.pin.type === 'power_out' &&
        typeof r.pin.voltage === 'number' &&
        r.pin.voltage > 0,
    );

    // Direct short between a supply output and ground.
    if (grounds.length && supplies.length)
      for (const s of supplies)
        issues.push({
          severity: 'error',
          code: 'supply-short',
          instanceId: s.inst.id,
          pinId: s.pin.id,
          text: `${s.inst.name} · ${s.pin.label} is connected directly to ${grounds
            .map((g) => `${g.inst.name} · ${g.pin.label}`)
            .join(', ')}. That is a short across the supply.`,
        });

    // Two different supply outputs tied together.
    const levels = [...new Set(supplies.map((s) => s.pin.voltage))];
    if (levels.length > 1)
      issues.push({
        severity: 'error',
        code: 'supply-conflict',
        instanceId: supplies[0].inst.id,
        pinId: supplies[0].pin.id,
        text: `Supply outputs at different documented voltages are tied together: ${supplies
          .map((s) => `${s.inst.name} · ${s.pin.label} (${s.pin.voltage} V)`)
          .join(', ')}.`,
      });

    // A supply output driving a supply input of a different documented level.
    const inputs = refs.filter((r) => r.pin.type === 'power_in');
    for (const inp of inputs)
      for (const s of supplies)
        if (
          typeof s.pin.voltage === 'number' &&
          s.pin.voltage < 4 &&
          /^VIN$/i.test(inp.pin.label)
        )
          issues.push({
            severity: 'warning',
            code: 'vin-level',
            instanceId: inp.inst.id,
            pinId: inp.pin.id,
            text: `${inp.inst.name} · VIN is fed from ${s.inst.name} · ${s.pin.label} (${s.pin.voltage} V). VIN normally needs a higher input than the regulated rail.`,
          });

    // Logic level mismatch between boards on the same node.
    const gpios = refs.filter(
      (r) => r.pin.type === 'gpio' || r.pin.type === 'analog_in',
    );
    const boardLevels = [
      ...new Set(
        gpios
          .map((g) => g.model.logicVoltage)
          .filter((v): v is number => typeof v === 'number'),
      ),
    ];
    if (new Set(gpios.map((g) => g.inst.id)).size > 1 && boardLevels.length > 1)
      issues.push({
        severity: 'warning',
        code: 'logic-level',
        instanceId: gpios[0].inst.id,
        pinId: gpios[0].pin.id,
        text: `${gpios
          .map((g) => `${g.inst.name} · ${g.pin.label}`)
          .join(
            ' and ',
          )} are on the same node but the boards have different documented logic levels (${boardLevels.join(
          ' V / ',
        )} V). Level shifting may be required.`,
      });

    if (
      new Set(gpios.map((g) => g.inst.id)).size > 1 &&
      gpios.some((g) => g.model.logicVoltage == null)
    )
      issues.push({
        severity: 'info',
        code: 'logic-level-unknown',
        text: 'A connected device has no documented logic voltage. Compatibility cannot be established.',
      });
    for (const gpio of gpios)
      for (const supply of supplies)
        if (
          typeof gpio.model.logicVoltage === 'number' &&
          supply.pin.voltage! > gpio.model.logicVoltage
        )
          issues.push({
            severity: 'warning',
            code: 'gpio-overvoltage',
            instanceId: gpio.inst.id,
            pinId: gpio.pin.id,
            text: `${gpio.inst.name} · ${gpio.pin.label} is tied to ${supply.pin.voltage} V, above its documented ${gpio.model.logicVoltage} V logic supply. Check the pin's absolute maximum rating.`,
          });

    // Input-only pins driven as outputs is not knowable without firmware, so it
    // is reported as information rather than an error.
    const inputOnly = refs.filter((r) => /input only/i.test(r.pin.note ?? ''));
    if (inputOnly.length && refs.length > 1)
      for (const r of inputOnly)
        issues.push({
          severity: 'info',
          code: 'input-only',
          instanceId: r.inst.id,
          pinId: r.pin.id,
          text: `${r.inst.name} · ${r.pin.label} is input-only on this variant; it cannot drive this node.`,
        });
  }

  // Physical capacity: one hole holds one lead.
  const occupancy = new Map<string, string[]>();
  for (const wire of w.wires)
    for (const e of [wire.a, wire.b])
      if (e.kind === 'breadboard-hole') {
        const key = `${e.instanceId}:${e.holeId}`;
        occupancy.set(key, [
          ...(occupancy.get(key) ?? []),
          `wire ${wire.label ?? wire.id}`,
        ]);
      }
  for (const inst of w.instances)
    if (inst.mounted)
      for (const [pinId, holeId] of Object.entries(inst.mounted.pins)) {
        const key = `${inst.mounted.boardInstanceId}:${holeId}`;
        occupancy.set(key, [
          ...(occupancy.get(key) ?? []),
          `${inst.name} · ${pinId}`,
        ]);
      }
  for (const [key, users] of occupancy)
    if (users.length > 1)
      issues.push({
        severity: 'error',
        code: 'hole-capacity',
        text: `Hole ${describeHole(key.split(':')[1])} has ${users.length} leads in it: ${users.join(
          ', ',
        )}. A breadboard hole takes one lead.`,
      });

  return issues;
}

/** Net summary for the properties panel and the assembly guide. */
export function netSummary(w: Workbench, lookup: ModelLookup) {
  const conn = buildConnectivity(w, lookup);
  const out: { net: string; members: string[] }[] = [];
  for (const [root, nodes] of conn.nets) {
    const members: string[] = [];
    for (const n of nodes) {
      const [kind, instanceId, rest] = n.split(':');
      const inst = w.instances.find((i) => i.id === instanceId);
      if (!inst) continue;
      if (kind === 'pin') {
        const model = lookup(inst.modelId);
        const pin = model?.pins.find((p) => p.id === rest);
        if (pin) members.push(`${inst.name} · ${pin.label}`);
      }
    }
    if (members.length > 1) out.push({ net: root, members });
  }
  return out;
}
