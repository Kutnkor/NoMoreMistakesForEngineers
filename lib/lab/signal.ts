import { finiteTransfer, type OpAmp } from './realistic.ts';
import type { Parts } from '../circuit.ts';
export function sensorSignal(
  p: Parts,
  op: OpAmp,
  sampleHz: number,
  vibrationHz: number,
  amplitude: number,
) {
  const targetHz = 12,
    signalAmplitude = 0.6,
    duration = 0.4;
  const pass = finiteTransfer(p, targetHz, op),
    noise = finiteTransfer(p, vibrationHz, op);
  const points = Array.from(
    { length: Math.max(32, Math.round(duration * sampleHz)) },
    (_, i) => {
      const t = i / sampleHz,
        clean = signalAmplitude * Math.sin(2 * Math.PI * targetHz * t),
        raw = clean + amplitude * Math.sin(2 * Math.PI * vibrationHz * t + 0.4);
      const filtered =
        signalAmplitude *
          Math.hypot(...pass) *
          Math.sin(2 * Math.PI * targetHz * t + Math.atan2(pass[1], pass[0])) +
        amplitude *
          Math.hypot(...noise) *
          Math.sin(
            2 * Math.PI * vibrationHz * t +
              0.4 +
              Math.atan2(noise[1], noise[0]),
          );
      return { x: t * 1000, clean, raw, filtered };
    },
  );
  const rmse = (key: 'raw' | 'filtered') =>
    Math.sqrt(
      points.reduce((s, p) => s + (p[key] - p.clean) ** 2, 0) / points.length,
    );
  let alias = Math.abs(
    ((vibrationHz + sampleHz / 2) % sampleHz) - sampleHz / 2,
  );
  if (alias < 1e-10) alias = 0;
  return {
    points,
    rawRmse: rmse('raw'),
    filteredRmse: rmse('filtered'),
    vibrationAttenuationDb: -20 * Math.log10(Math.hypot(...noise)),
    signalGainDb: 20 * Math.log10(Math.hypot(...pass)),
    phaseDelayMs:
      (-Math.atan2(pass[1], pass[0]) / (2 * Math.PI * targetHz)) * 1000,
    aliasHz: alias,
    targetHz,
    sampleHz,
    vibrationHz,
    amplitude,
    model:
      'Steady-state two-sine linear AC response, sampled after the analog filter. No transient, ADC quantization or real flight recording.',
  };
}
