import type { Circuit, Component } from './model.ts';
import type { Parts } from '../circuit.ts';
const r = (ref: string, value: number, a: string, b: string): Component => ({
  ref,
  type: 'resistor',
  value,
  unit: 'ohm',
  tolerance: 0.01,
  pins: [a, b],
});
const cap = (
  ref: string,
  value: number,
  a: string,
  b: string,
  film = false,
): Component => ({
  ref,
  type: film ? 'capacitor_film' : 'capacitor_ceramic',
  value,
  unit: 'F',
  tolerance: 0.1,
  pins: [a, b],
});
const amp = (pins: Record<string, string>): Component => ({
  ref: 'U1',
  type: 'ic_dip8',
  part: 'TL072',
  pins: {
    '1': 'OUT',
    '2': 'OUT',
    '3': 'B',
    '4': 'VEE',
    '5': 'NC',
    '6': 'NC',
    '7': 'NC',
    '8': 'VCC',
    ...pins,
  },
});
const power = { rails: ['VCC', 'VEE', 'GND'], vcc: 9, vee: -9 };
export function sallenKeyCircuit(
  p: Parts = { r1: 11000, r2: 11000, c1: 22e-9, c2: 10e-9 },
): Circuit {
  return {
    title: 'Sallen–Key 2nd-order low-pass',
    components: [
      r('R1', p.r1, 'IN', 'A'),
      r('R2', p.r2, 'A', 'B'),
      cap('C1', p.c1, 'A', 'OUT'),
      cap('C2', p.c2, 'B', 'GND'),
      amp({}),
    ],
    nets: ['IN', 'A', 'B', 'OUT', 'GND', 'VCC', 'VEE'],
    power,
  };
}
export const EXAMPLES: { id: string; name: string; circuit: Circuit }[] = [
  {
    id: 'sk-lp',
    name: 'Sallen–Key · low-pass',
    circuit: sallenKeyCircuit(),
  },
  {
    id: 'sk-hp',
    name: 'Sallen–Key · high-pass',
    circuit: {
      title: 'Sallen–Key 2nd-order high-pass',
      components: [
        cap('C1', 10e-9, 'IN', 'A'),
        cap('C2', 10e-9, 'A', 'B'),
        r('R1', 11000, 'A', 'OUT'),
        r('R2', 22000, 'B', 'GND'),
        amp({}),
      ],
      nets: ['IN', 'A', 'B', 'OUT', 'GND', 'VCC', 'VEE'],
      power,
    },
  },
  {
    id: 'mfb-bp',
    name: 'MFB · band-pass',
    circuit: {
      title: 'Multiple-feedback band-pass',
      components: [
        r('R1', 10000, 'IN', 'A'),
        r('R2', 10000, 'A', 'GND'),
        r('R3', 47000, 'B', 'OUT'),
        cap('C1', 10e-9, 'A', 'B'),
        cap('C2', 10e-9, 'A', 'OUT'),
        amp({ '2': 'B', '3': 'GND' }),
      ],
      nets: ['IN', 'A', 'B', 'OUT', 'GND', 'VCC', 'VEE'],
      power,
    },
  },
  {
    id: 'rc',
    name: 'Passive RC',
    circuit: {
      title: 'Passive RC low-pass',
      components: [
        r('R1', 10000, 'IN', 'OUT'),
        cap('C1', 100e-9, 'OUT', 'GND'),
      ],
      nets: ['IN', 'OUT', 'GND'],
      power: { rails: ['GND'], vcc: 0, vee: 0 },
    },
  },
  {
    id: 'cascade',
    name: 'Cascade · 4th order',
    circuit: {
      title: 'Cascaded 4th-order low-pass',
      components: [
        r('R1', 11000, 'IN', 'A1'),
        r('R2', 11000, 'A1', 'B1'),
        cap('C1', 22e-9, 'A1', 'MID'),
        cap('C2', 10e-9, 'B1', 'GND'),
        r('R3', 11000, 'MID', 'A2'),
        r('R4', 11000, 'A2', 'B2'),
        cap('C3', 22e-9, 'A2', 'OUT', true),
        cap('C4', 10e-9, 'B2', 'GND', true),
        amp({
          '1': 'MID',
          '2': 'MID',
          '3': 'B1',
          '5': 'B2',
          '6': 'OUT',
          '7': 'OUT',
        }),
      ],
      nets: ['IN', 'A1', 'B1', 'MID', 'A2', 'B2', 'OUT', 'GND', 'VCC', 'VEE'],
      power,
    },
  },
];
