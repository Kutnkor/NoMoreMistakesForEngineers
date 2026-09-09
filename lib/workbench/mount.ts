// Plugging a board, module or part into a breadboard.
//
// This is never applied automatically to every product: the exact variant has
// to pass a header check first. An UNO stays beside the board and is wired
// with jumpers.
import { HOLE_MAP, HOLES, PITCH, ROWS } from '../breadboard/model.ts';
import { localToTable, tableToLocal, effectiveTransform } from './geometry.ts';
import { lookupModel } from './registry.ts';
import type { PhysicalModel } from './physical.ts';
import type { Instance, Rotation, Workbench } from './types.ts';

export type MountCheck =
  | { ok: true; pins: Record<string, string>; note?: string }
  | { ok: false; reason: string };

const near = (a: number, b: number, eps = 0.35) => Math.abs(a - b) < eps;

/** Can this exact variant be pushed into an 830-point board at all? */
export function headerCompatible(model: PhysicalModel): MountCheck | null {
  const h = model.header;
  if (!h)
    return {
      ok: false,
      reason: `${model.name} has no documented header geometry.`,
    };
  if (!h.breadboardMountable)
    return {
      ok: false,
      reason:
        h.note ??
        `${model.name} is not breadboard-mountable in this variant; wire it with jumpers instead.`,
    };
  if (!near(h.pitch, PITCH, 0.05))
    return {
      ok: false,
      reason: `${model.name} uses a ${h.pitch} mm pitch; this board is ${PITCH} mm.`,
    };
  if (h.rowSpacing === null) return null;
  // The row span must land on the hole grid.
  const spans = new Set<number>();
  for (const a of ROWS)
    for (const b of ROWS) {
      const ha = HOLES.find((x) => x.col === 1 && x.row === a)!,
        hb = HOLES.find((x) => x.col === 1 && x.row === b)!;
      spans.add(Math.round(Math.abs(ha.y - hb.y) * 100) / 100);
    }
  const target = Math.round(h.rowSpacing * 100) / 100;
  if (![...spans].some((s) => near(s, target, 0.2)))
    return {
      ok: false,
      reason: `${model.name} has a ${h.rowSpacing} mm row spacing, which does not land on the hole grid across the centre channel.`,
    };
  return null; // no objection
}

/** Which hole each physical pin would occupy at the instance's current pose. */
export function previewMount(
  inst: Instance,
  model: PhysicalModel,
  board: Instance,
  boardModel: PhysicalModel,
): MountCheck {
  const blocked = headerCompatible(model);
  if (blocked) return blocked;

  const pins: Record<string, string> = {};
  const used = new Set<string>();
  for (const pin of model.pins) {
    const table = localToTable(inst.transform, model.origin, pin);
    const local = tableToLocal(board.transform, boardModel.origin, table);
    let best: string | null = null,
      bestD = Infinity;
    for (const h of HOLE_MAP.values()) {
      const d = Math.hypot(h.x - local.x, h.y - local.y);
      if (d < bestD) {
        bestD = d;
        best = h.id;
      }
    }
    if (!best || bestD > 0.9)
      return {
        ok: false,
        reason: `Pin ${pin.label} does not line up with a hole (${bestD.toFixed(2)} mm away). Move the board onto the grid.`,
      };
    if (used.has(best))
      return {
        ok: false,
        reason: `Pins ${pin.label} and another pin would share hole ${best}.`,
      };
    used.add(best);
    pins[pin.id] = best;
  }
  return {
    ok: true,
    pins,
    note: model.header?.note,
  };
}

/** Snap the instance so its pins sit exactly in the holes chosen by the preview. */
export function alignToHoles(
  inst: Instance,
  model: PhysicalModel,
  board: Instance,
  boardModel: PhysicalModel,
  pins: Record<string, string>,
): Instance {
  const first = model.pins[0];
  const hole = HOLE_MAP.get(pins[first.id]);
  if (!hole) return inst;
  const want = localToTable(board.transform, boardModel.origin, {
    x: hole.x,
    y: hole.y,
  });
  const have = localToTable(inst.transform, model.origin, first);
  return {
    ...inst,
    transform: {
      ...inst.transform,
      x: inst.transform.x + (want.x - have.x),
      y: inst.transform.y + (want.y - have.y),
      rot: ((inst.transform.rot - board.transform.rot + 360) % 360) as Rotation,
    },
    mounted: { boardInstanceId: board.id, pins },
  };
}

/** Moving a mounted object lifts it out; the caller decides whether to re-seat. */
export const unmount = (inst: Instance): Instance => {
  const { mounted: _drop, ...rest } = inst;
  return rest as Instance;
};

/** Breadboard moves carry everything plugged into it. */
export function moveInstance(
  w: Workbench,
  id: string,
  dx: number,
  dy: number,
): Workbench {
  const target = w.instances.find((i) => i.id === id);
  if (!target) return w;
  const pose = effectiveTransform(
    target,
    lookupModel(target.modelId)!,
    w,
    lookupModel,
  );
  return {
    ...w,
    instances: w.instances.map((i) =>
      i.id === id
        ? {
            ...i,
            mounted: undefined,
            transform: { ...pose, x: pose.x + dx, y: pose.y + dy },
          }
        : i,
    ),
  };
}

export function rotateInstance(
  w: Workbench,
  id: string,
  delta = 90,
): Workbench {
  return {
    ...w,
    instances: w.instances.map((i) =>
      i.id === id
        ? {
            ...i,
            transform: {
              ...effectiveTransform(i, lookupModel(i.modelId)!, w, lookupModel),
              rot: ((((effectiveTransform(
                i,
                lookupModel(i.modelId)!,
                w,
                lookupModel,
              ).rot +
                delta) %
                360) +
                360) %
                360) as Rotation,
            },
            // Rotating a seated object lifts it; the user re-seats it deliberately.
            ...(i.mounted ? { mounted: undefined } : {}),
          }
        : i,
    ),
  };
}
