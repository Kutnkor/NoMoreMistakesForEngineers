// Versioned project format, migration from the v1 breadboard layout, and an
// undo history that records one entry per user action rather than per pointer
// move.
import {
  HEIGHT,
  HOLE_MAP,
  pinsOf,
  type Circuit,
  type Layout,
} from '../breadboard/model.ts';
import { lookupModel } from './registry.ts';
import type {
  BenchWire,
  ConnectionEndpoint,
  Instance,
  Workbench,
} from './types.ts';
import { emptyWorkbench } from './types.ts';

export const PROJECT_VERSION = 2 as const;

const PART_MODEL: Record<string, string> = {
  resistor: 'part-resistor',
  capacitor_ceramic: 'part-capacitor-ceramic',
  capacitor_film: 'part-capacitor-film',
  capacitor_electrolytic: 'part-capacitor-electrolytic',
  inductor: 'part-inductor',
  ic_dip8: 'part-ic-dip8',
  wire: 'part-resistor', // jumpers become real wires during migration
};

/** v1 Breadboard Lab layout -> v2 workbench. Nothing is invented. */
export function migrateV1(
  circuit: Circuit,
  layout: Layout,
  title?: string,
): Workbench {
  const w = emptyWorkbench();
  w.title = title ?? circuit.title;
  const bb: Instance = {
    id: 'bb1',
    modelId: 'breadboard-830',
    kind: 'breadboard',
    name: 'Breadboard 1',
    transform: { x: 0, y: 0, rot: 0 },
  };
  w.instances.push(bb);

  let n = 0;
  let parked = 0; // parts the v1 layout never placed go into a tray row, not on top of each other
  for (const part of circuit.components) {
    const place = layout.parts[part.ref];
    if (part.type === 'wire') {
      // A v1 jumper part is a wire, not a component.
      const a = place?.pins['1'],
        b = place?.pins['2'];
      if (a && b && HOLE_MAP.has(a) && HOLE_MAP.has(b))
        w.wires.push({
          id: `mw${++n}`,
          a: { kind: 'breadboard-hole', instanceId: bb.id, holeId: a },
          b: { kind: 'breadboard-hole', instanceId: bb.id, holeId: b },
          color: '#3b7dd8',
          label: part.ref,
          route: [],
        });
      continue;
    }
    const modelId = PART_MODEL[part.type];
    if (!modelId) continue;
    const inst: Instance = {
      id: part.ref,
      modelId,
      kind: 'part',
      name: part.ref,
      transform: {
        x: 0,
        y: 0,
        rot: (place?.rotation ?? 0) as Instance['transform']['rot'],
      },
      value: part.value,
      unit: part.unit,
      tolerance: part.tolerance,
    };
    let seated = false;
    if (place) {
      const pins: Record<string, string> = {};
      for (const [pin] of pinsOf(part)) {
        const hole = place.pins[pin];
        if (hole && HOLE_MAP.has(hole)) pins[pin] = hole;
      }
      if (Object.keys(pins).length) {
        inst.mounted = { boardInstanceId: bb.id, pins };
        seated = true;
      }
    }
    if (!seated) {
      inst.transform = {
        x: 14 + parked * 18,
        y: HEIGHT + 26,
        rot: inst.transform.rot,
      };
      parked += 1;
    }
    w.instances.push(inst);
  }

  for (const wire of layout.wires) {
    const a = wire.a.hole,
      b = wire.b.hole;
    if (!HOLE_MAP.has(a) || !HOLE_MAP.has(b)) continue;
    w.wires.push({
      id: wire.id,
      a: { kind: 'breadboard-hole', instanceId: bb.id, holeId: a },
      b: { kind: 'breadboard-hole', instanceId: bb.id, holeId: b },
      color: wire.color,
      route: [],
    });
  }
  w.target = {
    title: circuit.title,
    pins: circuit.components
      .filter((c) => c.type !== 'wire')
      .flatMap((c) =>
        pinsOf(c).map(([pinId, net]) => ({
          endpoint: {
            kind: 'component-pin' as const,
            instanceId: c.ref,
            pinId,
          },
          net: net === 'NC' ? `NC@${c.ref}.${pinId}` : net,
        })),
      ),
    values: circuit.components
      .filter((c) => c.value !== undefined)
      .map((c) => ({ instanceId: c.ref, value: c.value! })),
  };
  return w;
}

const isEndpoint = (v: unknown): v is ConnectionEndpoint => {
  if (!v || typeof v !== 'object') return false;
  const e = v as ConnectionEndpoint;
  if (typeof e.instanceId !== 'string') return false;
  if (e.kind === 'breadboard-hole') return typeof e.holeId === 'string';
  return (
    (e.kind === 'board-pin' || e.kind === 'component-pin') &&
    typeof (e as { pinId: string }).pinId === 'string'
  );
};

/** Strict import. A broken project is reported, never silently rewritten. */
export function parseWorkbench(input: unknown): Workbench {
  if (!input || typeof input !== 'object')
    throw Error('The project must be a JSON object.');
  const raw = input as Record<string, unknown>;

  if (raw.version === 1 || (raw.circuit && raw.layout))
    return migrateV1(
      raw.circuit as Circuit,
      raw.layout as Layout,
      raw.title as string,
    );

  if (raw.version !== PROJECT_VERSION)
    throw Error(
      `Unsupported project version ${String(raw.version)}. This build reads version ${PROJECT_VERSION} and v1 breadboard layouts.`,
    );
  if (!Array.isArray(raw.instances) || !Array.isArray(raw.wires))
    throw Error('The project must contain "instances" and "wires" arrays.');

  if (raw.instances.length > 500 || raw.wires.length > 3000)
    throw Error('Project exceeds 500 objects or 3000 wires.');
  const instances: Instance[] = [];
  const ids = new Set<string>();
  for (const v of raw.instances as Instance[]) {
    if (!v || typeof v.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(v.id))
      throw Error('An instance is missing its id.');
    if (ids.has(v.id)) throw Error(`Duplicate instance id "${v.id}".`);
    ids.add(v.id);
    const model = lookupModel(v.modelId);
    if (!model)
      throw Error(
        `Instance "${v.id}" refers to model "${v.modelId}", which this build has no physical model for.`,
      );
    if (
      !v.transform ||
      !Number.isFinite(v.transform.x) ||
      !Number.isFinite(v.transform.y)
    )
      throw Error(`Instance "${v.id}" has an invalid transform.`);
    if (![0, 90, 180, 270].includes(v.transform.rot))
      throw Error(`Instance "${v.id}" has an unsupported rotation.`);
    if (v.mounted) {
      for (const [pinId, holeId] of Object.entries(v.mounted.pins)) {
        if (
          model.kind !== 'breadboard' &&
          !model.pins.some((p) => p.id === pinId)
        )
          throw Error(
            `Instance "${v.id}" is mounted through unknown pin "${pinId}".`,
          );
        if (!HOLE_MAP.has(holeId))
          throw Error(
            `Instance "${v.id}" is mounted into unknown hole "${holeId}".`,
          );
      }
    }
    if (v.kind !== model.kind)
      throw Error(`Instance "${v.id}" has the wrong kind.`);
    if (v.value !== undefined && (!Number.isFinite(v.value) || v.value <= 0))
      throw Error('Component values must be positive finite numbers.');
    instances.push({ ...v, name: typeof v.name === 'string' ? v.name : v.id });
  }

  for (const inst of instances)
    if (inst.mounted) {
      const host = instances.find(
        (i) => i.id === inst.mounted!.boardInstanceId,
      );
      if (!host || host.kind !== 'breadboard' || host.id === inst.id)
        throw Error(`Invalid breadboard mount for ${inst.id}.`);
    }
  const wires: BenchWire[] = [];
  const wireIds = new Set<string>();
  for (const v of raw.wires as BenchWire[]) {
    if (!v || typeof v.id !== 'string')
      throw Error('A wire is missing its id.');
    if (wireIds.has(v.id)) throw Error(`Duplicate wire id "${v.id}".`);
    wireIds.add(v.id);
    if (!isEndpoint(v.a) || !isEndpoint(v.b))
      throw Error(`Wire "${v.id}" has an invalid endpoint.`);
    for (const e of [v.a, v.b]) {
      const inst = instances.find((i) => i.id === e.instanceId);
      if (!inst)
        throw Error(
          `Wire "${v.id}" refers to missing instance "${e.instanceId}".`,
        );
      const model = lookupModel(inst.modelId)!;
      if (e.kind === 'breadboard-hole') {
        if (model.kind !== 'breadboard' || !HOLE_MAP.has(e.holeId))
          throw Error(
            `Wire "${v.id}" refers to hole "${e.holeId}", which does not exist here.`,
          );
      } else if (!model.pins.some((p) => p.id === e.pinId))
        throw Error(
          `Wire "${v.id}" refers to pin "${e.pinId}", which "${inst.modelId}" does not have.`,
        );
    }
    if (
      v.route !== undefined &&
      (!Array.isArray(v.route) ||
        v.route.length > 100 ||
        v.route.some((p) => !Number.isFinite(p?.x) || !Number.isFinite(p?.y)))
    )
      throw Error(`Wire "${v.id}" has invalid waypoints.`);
    if (
      v.lift !== undefined &&
      (!Number.isFinite(v.lift) || v.lift < 0 || v.lift > 100)
    )
      throw Error(`Wire "${v.id}" has an invalid height.`);
    wires.push({
      ...v,
      color: typeof v.color === 'string' ? v.color : '#3b7dd8',
      route: Array.isArray(v.route)
        ? v.route.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
        : [],
    });
  }

  return {
    version: PROJECT_VERSION,
    title: typeof raw.title === 'string' ? raw.title : 'Untitled workbench',
    instances,
    wires,
    target: parseTarget(raw.target),
    firmware: typeof raw.firmware === 'string' ? raw.firmware : undefined,
    libraries: typeof raw.libraries === 'string' ? raw.libraries : undefined,
    lesson: typeof raw.lesson === 'string' ? raw.lesson : undefined,
    targetCircuitId:
      typeof raw.targetCircuitId === 'string' ? raw.targetCircuitId : undefined,
  };
}

export const serializeWorkbench = (w: Workbench) => JSON.stringify(w, null, 2);

// ---------------------------------------------------------------------------
// Undo history. One entry per user action; a drag is coalesced by its label.
// ---------------------------------------------------------------------------
export type History = {
  past: Workbench[];
  future: Workbench[];
  lastLabel?: string;
};

export const emptyHistory = (): History => ({ past: [], future: [] });

export function commit(
  history: History,
  previous: Workbench,
  label: string,
  coalesce = false,
): History {
  if (coalesce && history.lastLabel === label && history.past.length)
    return { ...history, future: [], lastLabel: label };
  return {
    past: [...history.past.slice(-49), structuredClone(previous)],
    future: [],
    lastLabel: label,
  };
}

export function undo(history: History, current: Workbench) {
  if (!history.past.length) return null;
  const previous = history.past[history.past.length - 1];
  return {
    workbench: previous,
    history: {
      past: history.past.slice(0, -1),
      future: [structuredClone(current), ...history.future].slice(0, 50),
      lastLabel: undefined,
    } as History,
  };
}

export function redo(history: History, current: Workbench) {
  if (!history.future.length) return null;
  const next = history.future[0];
  return {
    workbench: next,
    history: {
      past: [...history.past, structuredClone(current)],
      future: history.future.slice(1),
      lastLabel: undefined,
    } as History,
  };
}

function parseTarget(raw: unknown): Workbench['target'] {
  if (raw === undefined) return undefined;
  const v = raw as NonNullable<Workbench['target']>;
  if (
    !v ||
    typeof v.title !== 'string' ||
    !Array.isArray(v.pins) ||
    v.pins.length > 10000 ||
    v.pins.some((p) => !isEndpoint(p.endpoint) || typeof p.net !== 'string')
  )
    throw Error('Invalid target circuit.');
  if (
    v.values &&
    (!Array.isArray(v.values) ||
      v.values.some(
        (p) =>
          typeof p.instanceId !== 'string' ||
          !Number.isFinite(p.value) ||
          p.value <= 0,
      ))
  )
    throw Error('Invalid target values.');
  return structuredClone(v);
}
