import { buildConnectivity, analyzeWorkbench } from '../netlist.ts';
import { lookupModel } from '../registry.ts';
import type { Instance, Workbench } from '../types.ts';

export type RuntimeCircuit = {
  boardId: string;
  leds: { id: string; pin: number; activeLow: boolean; resistance: number }[];
  buttons: { id: string; pin: number }[];
  pots: { id: string; channel: number; reverse: boolean }[];
};
export type RuntimeInputs = {
  buttons: Record<string, boolean>;
  pots: Record<string, number>;
};
export type RuntimeFrame = {
  inputs?: RuntimeInputs;
  milliseconds: number;
  leds: Record<string, number>;
  pins: number[];
  serial: string;
  running: boolean;
};
export const EMPTY_FRAME: RuntimeFrame = {
  milliseconds: 0,
  leds: {},
  pins: [],
  serial: '',
  running: false,
};

// This adapter deliberately accepts a small, checked circuit vocabulary. It is
// a digital AVR workbench, not a substitute for the analog SPICE engine.
export function runtimeCircuit(w: Workbench): RuntimeCircuit {
  const boards = w.instances.filter((i) => i.kind === 'board');
  if (boards.length !== 1 || !['uno-rev3', 'nano'].includes(boards[0].modelId))
    throw Error(
      'In-app execution needs one Arduino UNO R3 or classic Nano (ATmega328P). Use Export simulation for other controllers.',
    );
  const allowed = new Set([
    'uno-rev3',
    'nano',
    'breadboard-830',
    'part-resistor',
    'part-led',
    'part-button',
    'part-potentiometer',
  ]);
  const unsupported = w.instances.filter((i) => !allowed.has(i.modelId));
  if (unsupported.length)
    throw Error(
      `In-app peripheral models are not available for ${unsupported.map((i) => i.name).join(', ')}. Use Export simulation, or start with the LED circuit.`,
    );
  const errors = analyzeWorkbench(w, lookupModel).filter(
    (i) => i.severity === 'error',
  );
  if (errors.length) throw Error(errors.map((i) => i.text).join(' '));
  const board = boards[0],
    graph = buildConnectivity(w, lookupModel);
  const net = (i: Instance, pinId: string) =>
    graph.netOf({
      kind: i.kind === 'board' ? 'board-pin' : 'component-pin',
      instanceId: i.id,
      pinId,
    });
  const pins = lookupModel(board.modelId)!.pins;
  const gnd = new Set(
    pins.filter((p) => p.type === 'ground').map((p) => net(board, p.id)),
  );
  const supply = new Set(
    pins
      .filter(
        (p) =>
          p.label === '5V' ||
          (board.modelId === 'uno-rev3' && p.label === 'IOREF'),
      )
      .map((p) => net(board, p.id)),
  );
  const gpio = new Map<string, number>();
  for (const p of pins) {
    const d = /^D(\d+)/.exec(p.label),
      a = /^A([0-5])$/.exec(p.label);
    const n = d
      ? Number(d[1])
      : a
        ? Number(a[1]) + 14
        : p.label === 'SDA'
          ? 18
          : p.label === 'SCL'
            ? 19
            : -1;
    const key = net(board, p.id);
    if (n >= 0 && key) {
      if (gpio.has(key) && gpio.get(key) !== n)
        throw Error(
          'Separate connected GPIO outputs before running; bus contention is not simulated.',
        );
      if (gnd.has(key) || supply.has(key))
        throw Error(
          'A GPIO is tied directly to a supply rail. Use a supported button or resistor circuit.',
        );
      gpio.set(key, n);
    }
  }
  const result: RuntimeCircuit = {
    boardId: board.id,
    leds: [],
    buttons: [],
    pots: [],
  };
  const resistors = w.instances.filter((i) => i.modelId === 'part-resistor');
  const used = new Set<string>();
  for (const led of w.instances.filter((i) => i.modelId === 'part-led')) {
    const anode = net(led, '1'),
      cathode = net(led, '2');
    if (anode === cathode)
      throw Error(`${led.name}: both LED terminals are on the same net.`);
    let found = false;
    for (const r of resistors) {
      const ra = net(r, '1'),
        rb = net(r, '2');
      const beyond = (n: string | null) =>
        ra === n ? rb : rb === n ? ra : null;
      const paths = [
        { signal: beyond(anode), rail: cathode, low: false },
        { signal: anode, rail: beyond(cathode), low: false },
        { signal: cathode, rail: beyond(anode), low: true },
        { signal: beyond(cathode), rail: anode, low: true },
      ];
      const path = paths.find(
        (p) =>
          p.signal && gpio.has(p.signal) && (p.low ? supply : gnd).has(p.rail),
      );
      if (!path) continue;
      const resistance = r.value ?? 10000;
      if (resistance < 150 || resistance > 1e6 || !Number.isFinite(resistance))
        throw Error(
          `${r.name}: use 150 Ω to 1 MΩ for the supported LED model.`,
        );
      if (used.has(r.id))
        throw Error('Each simulated LED needs its own series resistor.');
      used.add(r.id);
      result.leds.push({
        id: led.id,
        pin: gpio.get(path.signal!)!,
        activeLow: path.low,
        resistance,
      });
      found = true;
      break;
    }
    if (!found)
      throw Error(
        `${led.name}: connect the LED through one series resistor between a GPIO and GND (or 5 V for active-low wiring).`,
      );
  }
  for (const b of w.instances.filter((i) => i.modelId === 'part-button')) {
    const a = net(b, '1'),
      c = net(b, '2');
    const signal = gnd.has(a) ? c : gnd.has(c) ? a : null;
    if (!signal || !gpio.has(signal))
      throw Error(
        `${b.name}: connect one contact to GND and the other to a GPIO; use INPUT_PULLUP in the sketch.`,
      );
    result.buttons.push({ id: b.id, pin: gpio.get(signal)! });
  }
  for (const p of w.instances.filter(
    (i) => i.modelId === 'part-potentiometer',
  )) {
    const a = net(p, '1'),
      c = net(p, '3'),
      signal = net(p, '2'),
      pin = signal ? gpio.get(signal) : undefined;
    if (
      pin === undefined ||
      pin < 14 ||
      !((supply.has(a) && gnd.has(c)) || (gnd.has(a) && supply.has(c)))
    )
      throw Error(
        `${p.name}: connect the wiper to A0–A5 and the outer terminals to 5 V and GND.`,
      );
    result.pots.push({ id: p.id, channel: pin - 14, reverse: gnd.has(a) });
  }
  if (resistors.some((r) => !used.has(r.id)))
    throw Error(
      'This runtime supports LED series resistors. Use the analog lab for resistor networks or remove unused resistors.',
    );
  const driven = [
    ...result.buttons.map((b) => b.pin),
    ...result.pots.map((p) => p.channel + 14),
  ];
  if (
    new Set(driven).size !== driven.length ||
    result.leds.some((l) => driven.includes(l.pin))
  )
    throw Error(
      'Give each interactive input its own GPIO; shared input/output networks need an analog simulator.',
    );
  return result;
}
