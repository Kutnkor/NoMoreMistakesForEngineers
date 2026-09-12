import { analyzeWorkbench, buildConnectivity } from './netlist.ts';
import { compareTarget } from './target.ts';
import { lookupModel } from './registry.ts';
import { sallenKeyCircuit } from '../breadboard/circuits.ts';
import { pinsOf } from '../breadboard/model.ts';
import { finiteTransfer, DEFAULT_OPAMP } from '../lab/realistic.ts';
import { PROBE_RATIOS, predictFault, type FaultModel } from '../lab/faults.ts';
import type { Workbench, ConnectionEndpoint } from './types.ts';
import type { Parts } from '../circuit.ts';
export function inspectConnections(w: Workbench) {
  return [
    ...analyzeWorkbench(w, lookupModel),
    ...compareTarget(w, lookupModel),
  ];
}
/** Only the supported Sallen–Key topology may enter the learned AC classifier. */
export function signalEvidence(w: Workbench): {
  features?: number[];
  reason: string;
  changedId?: string;
} {
  const canonical = sallenKeyCircuit();
  const ids = ['R1', 'R2', 'C1', 'C2', 'U1'];
  if (
    w.instances.filter((i) => i.kind !== 'breadboard').length !== 5 ||
    ids.some((id) => !w.instances.some((i) => i.id === id))
  )
    return {
      reason:
        'AI signal diagnosis supports the Sallen–Key low-pass reference. This circuit still receives connection checks.',
    };
  if (
    w.instances.some(
      (i) =>
        (i.id === 'U1' && i.modelId !== 'part-ic-dip8') ||
        (['R1', 'R2'].includes(i.id) && i.modelId !== 'part-resistor') ||
        (['C1', 'C2'].includes(i.id) &&
          !i.modelId.startsWith('part-capacitor')),
    )
  )
    return {
      reason: 'The component types do not match the trained circuit family.',
    };
  const c = buildConnectivity(w, lookupModel);
  const expected = canonical.components.flatMap((p) =>
    pinsOf(p).map(([pinId, net]) => ({
      e: {
        kind: 'component-pin',
        instanceId: p.ref,
        pinId,
      } as ConnectionEndpoint,
      net: net === 'NC' ? `${p.ref}:${pinId}` : net,
    })),
  );
  for (const a of expected)
    for (const b of expected)
      if (c.connected(a.e, b.e) !== (a.net === b.net))
        return {
          reason:
            'The wiring does not match the supported low-pass model. Resolve the highlighted connections before interpreting AC predictions.',
        };
  const values = w.target?.values;
  if (!values)
    return {
      reason:
        'A nominal reference is required to compare the circuit response.',
    };
  const nominal = {} as Parts,
    observed = {} as Parts;
  const changed: string[] = [];
  for (const id of ids.slice(0, 4)) {
    const key = id.toLowerCase() as keyof Parts,
      n = values.find((v) => v.instanceId === id)?.value,
      actual = w.instances.find((i) => i.id === id)?.value;
    const lo = id.startsWith('R') ? 1000 : 1e-9,
      hi = id.startsWith('R') ? 100000 : 1e-7;
    if (!n || !actual || n < lo || n > hi)
      return {
        reason: 'Reference component values fall outside the training domain.',
      };
    nominal[key] = n;
    observed[key] = actual;
    if (Math.abs(actual / n - 1) > 0.001) changed.push(id);
    if (actual / n < 0.35 || actual / n > 2)
      return {
        reason:
          'The value shift is outside the trained range; no reliable AI conclusion is available.',
      };
  }
  if (changed.length > 1 || changed.some((id) => id.startsWith('R')))
    return {
      reason:
        'This model was not trained for these combined/value faults. Connection and reference checks remain available.',
    };
  const f0 =
      1 /
      (2 *
        Math.PI *
        Math.sqrt(nominal.r1 * nominal.r2 * nominal.c1 * nominal.c2)),
    features: number[] = [];
  for (const ratio of PROBE_RATIOS) {
    const a = finiteTransfer(nominal, f0 * ratio, DEFAULT_OPAMP),
      b = finiteTransfer(observed, f0 * ratio, DEFAULT_OPAMP);
    const db =
      20 *
      Math.log10(
        Math.max(1e-15, Math.hypot(...b)) / Math.max(1e-15, Math.hypot(...a)),
      );
    let phase = Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]);
    phase = Math.atan2(Math.sin(phase), Math.cos(phase));
    features.push(Math.max(-80, Math.min(80, db)) / 20, phase / Math.PI);
  }
  return {
    features,
    changedId: changed[0],
    reason:
      'Prediction from 12 simulated AC probes of the current component values against the nominal reference. Fixed finite-bandwidth op-amp; synthetic evidence only.',
  };
}
export function diagnoseSignals(w: Workbench, model: FaultModel) {
  const evidence = signalEvidence(w);
  return {
    ...evidence,
    prediction: evidence.features
      ? predictFault(model, evidence.features)
      : null,
  };
}
