// The single place that defines the table plane and the height axis.
//
//   table plane : (x, y) millimetres, y increasing away from the viewer
//   height      : z millimetres above the table
//   three.js    : world = (x, z, y)   -- XZ is the table, Y is up
//
// Both views call these helpers, so a rotated board lands in the same place
// in 2D and 3D by construction.
import { HOLE_MAP } from '../breadboard/model.ts';
import type { PhysicalModel } from './physical.ts';
import type {
  ConnectionEndpoint,
  Instance,
  ModelLookup,
  Rotation,
  Transform,
  Workbench,
} from './types.ts';

export type TablePoint = { x: number; y: number; z: number };

const COS: Record<Rotation, number> = { 0: 1, 90: 0, 180: -1, 270: 0 };
const SIN: Record<Rotation, number> = { 0: 0, 90: 1, 180: 0, 270: -1 };

/** Local model coordinates -> table coordinates. */
export function localToTable(
  t: Transform,
  origin: { x: number; y: number },
  p: { x: number; y: number },
): { x: number; y: number } {
  const c = COS[t.rot],
    s = SIN[t.rot],
    dx = p.x - origin.x,
    dy = p.y - origin.y;
  return { x: t.x + dx * c - dy * s, y: t.y + dx * s + dy * c };
}

/** Table coordinates -> local model coordinates (inverse of localToTable). */
export function tableToLocal(
  t: Transform,
  origin: { x: number; y: number },
  p: { x: number; y: number },
): { x: number; y: number } {
  const c = COS[t.rot],
    s = SIN[t.rot],
    dx = p.x - t.x,
    dy = p.y - t.y;
  return { x: origin.x + dx * c + dy * s, y: origin.y - dx * s + dy * c };
}

/** Rotated bounding box of an instance on the table. */
export function instanceBox(
  inst: Instance,
  model: PhysicalModel,
  pose?: Transform,
) {
  const t = pose ?? inst.transform;
  const cs = [
    { x: 0, y: 0 },
    { x: model.body.w, y: 0 },
    { x: model.body.w, y: model.body.h },
    { x: 0, y: model.body.h },
  ].map((p) => localToTable(t, model.origin, p));
  const xs = cs.map((p) => p.x),
    ys = cs.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

export function workbenchBounds(w: Workbench, lookup: ModelLookup) {
  const boxes = w.instances
    .map((i) => {
      const m = lookup(i.modelId);
      return m ? instanceBox(i, m, effectiveTransform(i, m, w, lookup)) : null;
    })
    .filter(Boolean) as { x: number; y: number; w: number; h: number }[];
  if (!boxes.length) return { x: 0, y: 0, w: 200, h: 120 };
  const x0 = Math.min(...boxes.map((b) => b.x)),
    y0 = Math.min(...boxes.map((b) => b.y)),
    x1 = Math.max(...boxes.map((b) => b.x + b.w)),
    y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Pose an instance is actually drawn at.
 *
 * A seated part is drawn over the holes it occupies, not at its own stored
 * transform, so it follows the breadboard and can never drift away from the
 * pins the connectivity model uses.
 */
export function effectiveTransform(
  inst: Instance,
  model: PhysicalModel,
  w: Workbench,
  lookup: ModelLookup,
): Transform {
  if (!inst.mounted) return inst.transform;
  const host = w.instances.find((i) => i.id === inst.mounted!.boardInstanceId);
  const hostModel = host && lookup(host.modelId);
  if (!host || !hostModel) return inst.transform;
  const pin = model.pins.find((p) => inst.mounted!.pins[p.id]);
  const hole = pin && HOLE_MAP.get(inst.mounted.pins[pin.id]);
  if (!pin || !hole) return inst.transform;
  const rot = ((((inst.transform.rot + host.transform.rot) % 360) + 360) %
    360) as Rotation;
  const want = localToTable(host.transform, hostModel.origin, {
    x: hole.x,
    y: hole.y,
  });
  const base: Transform = { x: 0, y: 0, rot };
  const have = localToTable(base, model.origin, pin);
  return { x: want.x - have.x, y: want.y - have.y, rot };
}

/** Table position of a breadboard hole belonging to a specific instance. */
export function holePoint(
  inst: Instance,
  model: PhysicalModel,
  holeId: string,
): TablePoint | null {
  const h = HOLE_MAP.get(holeId);
  if (!h) return null;
  const p = localToTable(inst.transform, model.origin, { x: h.x, y: h.y });
  return { ...p, z: model.body.t };
}

/** Table position of a physical pin belonging to a specific instance. */
export function pinPoint(
  inst: Instance,
  model: PhysicalModel,
  pinId: string,
): TablePoint | null {
  const pin = model.pins.find((p) => p.id === pinId);
  if (!pin) return null;
  const p = localToTable(inst.transform, model.origin, pin);
  return { ...p, z: pin.z };
}

/**
 * Table position of a connection endpoint. Returns null when the endpoint no
 * longer resolves; callers must surface that rather than snapping elsewhere.
 */
export function endpointPoint(
  e: ConnectionEndpoint,
  w: Workbench,
  lookup: ModelLookup,
): TablePoint | null {
  const inst = w.instances.find((i) => i.id === e.instanceId);
  if (!inst) return null;
  const model = lookup(inst.modelId);
  if (!model) return null;
  if (e.kind === 'breadboard-hole') return holePoint(inst, model, e.holeId);
  const own = pinPoint(inst, model, e.pinId);
  if (!own) return null;
  // A mounted board's pin sits inside a breadboard hole; use the hole position
  // so the two never drift apart when either object moves.
  if (inst.mounted) {
    const holeId = inst.mounted.pins[e.pinId];
    const host = w.instances.find(
      (i) => i.id === inst.mounted!.boardInstanceId,
    );
    const hostModel = host && lookup(host.modelId);
    if (holeId && host && hostModel) {
      const hp = holePoint(host, hostModel, holeId);
      if (hp) return { ...hp, z: hp.z + own.z };
    }
  }
  return own;
}

/** three.js world vector components for a table point. */
export const worldOf = (p: TablePoint): [number, number, number] => [
  p.x,
  p.z,
  p.y,
];

export const rotateBy = (r: Rotation, delta: number): Rotation =>
  ((((r + delta) % 360) + 360) % 360) as Rotation;
