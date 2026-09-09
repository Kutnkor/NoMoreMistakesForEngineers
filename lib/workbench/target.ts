import {
  buildConnectivity,
  describeEndpoint,
  type BenchIssue,
} from './netlist.ts';
import type { ConnectionEndpoint, ModelLookup, Workbench } from './types.ts';

export type TargetIssue = BenchIssue & {
  endpoint?: ConnectionEndpoint;
  other?: ConnectionEndpoint;
};
export function compareTarget(
  w: Workbench,
  lookup: ModelLookup,
): TargetIssue[] {
  if (!w.target) return [];
  const c = buildConnectivity(w, lookup),
    out: TargetIssue[] = [];
  const expected = new Map<string, typeof w.target.pins>();
  const actual = new Map<string, typeof w.target.pins>();
  for (const p of w.target.pins) {
    const net = c.netOf(p.endpoint);
    if (!net) {
      out.push({
        severity: 'error',
        code: 'target-missing',
        instanceId: p.endpoint.instanceId,
        endpoint: p.endpoint,
        text: `Missing target terminal: ${describeEndpoint(p.endpoint, w, lookup)} (${p.net}).`,
      });
      continue;
    }
    expected.set(p.net, [...(expected.get(p.net) ?? []), p]);
    actual.set(net, [...(actual.get(net) ?? []), p]);
  }
  for (const [net, pins] of expected) {
    const first = pins[0];
    for (const p of pins.slice(1))
      if (!c.connected(first.endpoint, p.endpoint))
        out.push({
          severity: 'error',
          code: 'target-open',
          instanceId: p.endpoint.instanceId,
          endpoint: p.endpoint,
          other: first.endpoint,
          text: `${describeEndpoint(p.endpoint, w, lookup)} is disconnected from target net ${net}.`,
        });
  }
  for (const pins of actual.values()) {
    const nets = [...new Set(pins.map((p) => p.net))];
    if (nets.length > 1)
      out.push({
        severity: 'error',
        code: 'target-short',
        instanceId: pins[0].endpoint.instanceId,
        endpoint: pins[0].endpoint,
        other: pins.find((p) => p.net !== pins[0].net)!.endpoint,
        text: `Target nets ${nets.join(' / ')} are joined. Select this issue to trace the shared conductor.`,
      });
  }
  for (const p of w.target.values ?? []) {
    const i = w.instances.find((x) => x.id === p.instanceId);
    if (i && i.value !== p.value)
      out.push({
        severity: 'warning',
        code: 'target-value',
        instanceId: i.id,
        text: `${i.name}: value differs from the target (${p.value} ${i.unit ?? ''}).`,
      });
  }
  return out;
}

/** Capture topology, not a screenshot. Only use on a known-good example or a
 * user-chosen reference: a captured target does not prove circuit behavior. */
export function captureTarget(w: Workbench, lookup: ModelLookup): Workbench {
  const conn = buildConnectivity(w, lookup);
  return {
    ...w,
    target: {
      title: w.title,
      pins: w.instances.flatMap((i) =>
        (lookup(i.modelId)?.pins ?? []).map((p) => {
          const endpoint: ConnectionEndpoint = {
            kind: i.kind === 'board' ? 'board-pin' : 'component-pin',
            instanceId: i.id,
            pinId: p.id,
          };
          return { endpoint, net: conn.netOf(endpoint)! };
        }),
      ),
      values: w.instances
        .filter((i) => i.value !== undefined)
        .map((i) => ({ instanceId: i.id, value: i.value! })),
    },
  };
}

/** A preview adds a jumper only when it resolves the selected open without
 * adding any short. It is deliberately not a blanket 'repair' operation. */
export function repairOpen(
  w: Workbench,
  issue: TargetIssue,
  lookup: ModelLookup,
): Workbench | null {
  if (issue.code !== 'target-open' || !issue.endpoint || !issue.other)
    return null;
  const next = {
    ...w,
    wires: [
      ...w.wires,
      {
        id: `repair-${Date.now().toString(36)}`,
        a: issue.endpoint,
        b: issue.other,
        color: '#f59e0b',
        route: [],
      },
    ],
  };
  const before = compareTarget(w, lookup),
    after = compareTarget(next, lookup);
  if (
    after.length >= before.length ||
    after.filter((i) => i.code === 'target-short').length >
      before.filter((i) => i.code === 'target-short').length
  )
    return null;
  return next;
}

export function previewTargetRepair(
  w: Workbench,
  issue: TargetIssue,
  lookup: ModelLookup,
): { next: Workbench; text: string } | null {
  if (issue.code === 'target-open') {
    const next = repairOpen(w, issue, lookup);
    return next
      ? {
          next,
          text: `Add a jumper: ${describeEndpoint(issue.endpoint!, w, lookup)} → ${describeEndpoint(issue.other!, w, lookup)}`,
        }
      : null;
  }
  if (issue.code === 'target-value') {
    const value = w.target?.values?.find(
      (p) => p.instanceId === issue.instanceId,
    )?.value;
    if (value === undefined) return null;
    return {
      next: {
        ...w,
        instances: w.instances.map((i) =>
          i.id === issue.instanceId ? { ...i, value } : i,
        ),
      },
      text: `Restore ${issue.instanceId} to its reference value: ${value}.`,
    };
  }
  if (issue.code === 'target-short') {
    const before = compareTarget(w, lookup);
    for (const wire of w.wires) {
      const next = { ...w, wires: w.wires.filter((x) => x.id !== wire.id) },
        after = compareTarget(next, lookup);
      if (
        after.length < before.length &&
        after.filter((i) => i.code === 'target-open').length <=
          before.filter((i) => i.code === 'target-open').length
      )
        return {
          next,
          text: `Remove jumper ${wire.label ?? wire.id}: ${describeEndpoint(wire.a, w, lookup)} → ${describeEndpoint(wire.b, w, lookup)}.`,
        };
    }
  }
  return null;
}
