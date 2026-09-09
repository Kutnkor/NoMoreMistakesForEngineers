import { endpointPoint, effectiveTransform } from './geometry.ts';
import { lookupModel } from './registry.ts';
import type { BenchWire, Workbench } from './types.ts';

export function followRoutes(before: Workbench, after: Workbench): Workbench {
  return {
    ...after,
    wires: after.wires.map((wire) => {
      const old = before.wires.find((x) => x.id === wire.id);
      if (!old || !wire.route.length) return wire;
      const a0 = endpointPoint(old.a, before, lookupModel),
        b0 = endpointPoint(old.b, before, lookupModel);
      const a1 = endpointPoint(wire.a, after, lookupModel),
        b1 = endpointPoint(wire.b, after, lookupModel);
      if (!a0 || !b0 || !a1 || !b1) return wire;
      return {
        ...wire,
        route: wire.route.map((p, i) => {
          const t = (i + 1) / (wire.route.length + 1);
          return {
            x: p.x + (a1.x - a0.x) * (1 - t) + (b1.x - b0.x) * t,
            y: p.y + (a1.y - a0.y) * (1 - t) + (b1.y - b0.y) * t,
          };
        }),
      };
    }),
  };
}
export function removeInstance(w: Workbench, id: string): Workbench {
  return {
    ...w,
    instances: w.instances
      .filter((i) => i.id !== id)
      .map((i) =>
        i.mounted?.boardInstanceId === id
          ? {
              ...i,
              transform: effectiveTransform(
                i,
                lookupModel(i.modelId)!,
                w,
                lookupModel,
              ),
              mounted: undefined,
            }
          : i,
      ),
    wires: w.wires.filter(
      (x) => x.a.instanceId !== id && x.b.instanceId !== id,
    ),
  };
}
export function tidyWires(w: Workbench): Workbench {
  return {
    ...w,
    wires: w.wires.map((wire, i) => {
      const a = endpointPoint(wire.a, w, lookupModel),
        b = endpointPoint(wire.b, w, lookupModel);
      if (!a || !b) return wire;
      const y = Math.min(a.y, b.y) - 8 - (i % 6) * 3;
      return {
        ...wire,
        route: [
          { x: a.x, y },
          { x: b.x, y },
        ],
        lift: 10 + (i % 6) * 2,
      };
    }),
  };
}
export const replaceWire = (
  w: Workbench,
  id: string,
  patch: Partial<BenchWire>,
): Workbench => ({
  ...w,
  wires: w.wires.map((x) => (x.id === id ? { ...x, ...patch, id } : x)),
});
