import type { HardwarePlan } from './types.ts';
import { generateSketch, wiringMarkdown } from './sketch.ts';

export type WokwiPart = {
  type: string;
  id: string;
  top: number;
  left: number;
  attrs: Record<string, string>;
};
export type WokwiDiagram = {
  version: 1;
  author: string;
  editor: 'wokwi';
  parts: WokwiPart[];
  connections: [string, string, string, string[]][];
  dependencies: Record<string, string>;
};
export const WOKWI_BOARDS: Record<
  string,
  { type: string; kind: 'avr' | 'esp32' | 'pico' }
> = {
  'uno-rev3': { type: 'wokwi-arduino-uno', kind: 'avr' },
  nano: { type: 'wokwi-arduino-nano', kind: 'avr' },
  'mega-2560': { type: 'wokwi-arduino-mega', kind: 'avr' },
  'esp32-devkitc-v4': { type: 'board-esp32-devkit-c-v4', kind: 'esp32' },
  'raspberry-pi-pico': { type: 'wokwi-pi-pico', kind: 'pico' },
};
export const WOKWI_PARTS: Record<string, string> = {
  'led-red': 'wokwi-led',
  'pot-10k': 'wokwi-potentiometer',
  pushbutton: 'wokwi-pushbutton',
  'led-rgb-cc': 'wokwi-rgb-led',
  'piezo-passive': 'wokwi-buzzer',
  dht22: 'wokwi-dht22',
  ds18b20: 'wokwi-ds18b20',
  'mpu6050-adafruit': 'wokwi-mpu6050',
  'ssd1306-adafruit-128x64': 'board-ssd1306',
  'hcsr04-5v-sparkfun': 'wokwi-hc-sr04',
};
export function wokwiSupport(plan: HardwarePlan) {
  const reasons: string[] = [];
  if (!WOKWI_BOARDS[plan.board.id])
    reasons.push(
      `${plan.board.name} has no Wokwi mapping yet. Select UNO R3, Nano, Mega 2560, ESP32-DevKitC V4, or Pico.`,
    );
  if (!plan.canGenerate)
    reasons.push(
      "Resolve the wiring plan's errors and add a component with code support first.",
    );
  for (const item of plan.items)
    if (!WOKWI_PARTS[item.component.id])
      reasons.push(`${item.component.name} has no mapped simulator model.`);
  return { supported: reasons.length === 0, reasons };
}
export function wokwiBoardPin(boardId: string, pin: string): string {
  const kind = WOKWI_BOARDS[boardId]?.kind;
  if (!kind) throw Error('Unsupported Wokwi board');
  if (pin === 'GND') return 'GND.1';
  if (pin === '3.3V') return '3V3';
  if (pin === '5V') return '5V';
  if (kind === 'esp32')
    return pin === 'GPIO36'
      ? 'VP'
      : pin === 'GPIO39'
        ? 'VN'
        : pin.replace(/^GPIO/, '');
  if (kind === 'pico') return pin;
  return pin.replace(/^D/, '');
}
export function createWokwiProject(plan: HardwarePlan, interactive = true) {
  const support = wokwiSupport(plan);
  if (!support.supported) throw Error(support.reasons.join(' '));
  const board = WOKWI_BOARDS[plan.board.id],
    parts: WokwiPart[] = [
      { id: 'board', type: board.type, top: 20, left: 0, attrs: {} },
    ],
    connections: WokwiDiagram['connections'] = [];
  const b = (pin: string) => 'board:' + wokwiBoardPin(plan.board.id, pin),
    ground = b('GND'),
    logic = b(plan.board.logicVoltage === 5 ? '5V' : '3.3V');
  const add = (
    id: string,
    type: string,
    top: number,
    left: number,
    attrs: Record<string, string> = {},
  ) => parts.push({ id, type, top, left, attrs });
  const wire = (a: string, z: string, color = 'green') =>
    connections.push([a, z, color, []]);
  const notes = [
    'Simulation uses behavioral models of supported components; it does not validate analog power, current, or signal integrity.',
  ];
  if (board.kind === 'esp32') {
    wire('board:TX', '$serialMonitor:RX', '');
    wire('board:RX', '$serialMonitor:TX', '');
  }
  for (const [index, item] of plan.items.entries()) {
    const id = 'part' + (index + 1),
      t = 60 + Math.floor(index / 2) * 180,
      left = 300 + (index % 2) * 220,
      c = item.component;
    const pin = (name: string) => b(item.pins[name]);
    const power = item.power ? b(item.power) : logic;
    const attrs: Record<string, string> =
      c.id === 'led-red'
        ? { color: 'red' }
        : c.id === 'led-rgb-cc'
          ? { common: 'cathode' }
          : c.id === 'pot-10k'
            ? { value: '512' }
            : {};
    if (c.template === 'ssd1306')
      attrs.i2cAddress =
        '0x' + (item.selection.address ?? c.addresses[0]).toString(16);
    add(id, WOKWI_PARTS[c.id], t, left, attrs);
    const series = (target: string, source: string, suffix: string) => {
      const r = id + '_r' + suffix;
      add(r, 'wokwi-resistor', t - 28, left + 35 + Number(suffix || 0) * 25, {
        value: '1000',
      });
      wire(source, r + ':1');
      wire(r + ':2', id + ':' + target);
    };
    switch (c.template) {
      case 'led':
        series('A', pin('ANODE'), '');
        wire(id + ':C', ground, 'black');
        break;
      case 'rgb':
        for (const [j, k] of ['R', 'G', 'B'].entries())
          series(k, pin(k), String(j));
        wire(id + ':COM', ground, 'black');
        break;
      case 'button':
        wire(id + ':1.l', pin('SIGNAL'));
        wire(id + ':2.l', ground, 'black');
        break;
      case 'analog':
        wire(id + ':SIG', pin('OUT'));
        wire(id + ':VCC', power, 'red');
        wire(id + ':GND', ground, 'black');
        break;
      case 'piezo':
        wire(id + ':1', pin('SIGNAL'));
        wire(id + ':2', ground, 'black');
        break;
      case 'dht22':
      case 'ds18b20': {
        const data = c.template === 'dht22' ? 'SDA' : 'DQ';
        wire(id + ':' + data, pin('DATA'));
        wire(id + ':VCC', power, 'red');
        wire(id + ':GND', ground, 'black');
        add(id + '_pullup', 'wokwi-resistor', t - 35, left + 70, {
          value: '4700',
        });
        wire(id + '_pullup:1', id + ':' + data);
        wire(id + '_pullup:2', logic, 'red');
        break;
      }
      case 'ssd1306':
      case 'mpu6050':
        wire(id + ':SDA', pin('SDA'));
        wire(id + ':SCL', pin('SCL'), 'blue');
        wire(id + ':VCC', power, 'red');
        wire(id + ':GND', ground, 'black');
        if (c.template === 'mpu6050')
          wire(
            id + ':AD0',
            (item.selection.address ?? c.addresses[0]) === 0x69
              ? logic
              : ground,
            (item.selection.address ?? c.addresses[0]) === 0x69
              ? 'red'
              : 'black',
          );
        else
          notes.push(
            "The OLED uses Wokwi's four-pin SSD1306 model. The physical Adafruit module's RESET connection is disabled with -1 in this simulation code; real-board code is unchanged.",
          );
        break;
      case 'hcsr04':
        wire(id + ':TRIG', pin('TRIG'));
        wire(id + ':ECHO', pin('ECHO'), 'blue');
        wire(id + ':VCC', power, 'red');
        wire(id + ':GND', ground, 'black');
        break;
      default:
        throw Error('Unmapped component template');
    }
  }
  const diagram: WokwiDiagram = {
    version: 1,
    author: 'CIRCUIT FORGE',
    editor: 'wokwi',
    parts,
    connections,
    dependencies: {},
  };
  const code = generateSketch(plan, null, { interactive, simulatedOled: true });
  const libraries = [
    ...new Set([
      ...plan.libraries,
      ...(plan.libraries.some((s) => s.includes('Adafruit'))
        ? ['Adafruit BusIO', 'Adafruit Unified Sensor']
        : []),
      ...(plan.items.some((i) => i.component.template === 'dht22')
        ? ['Adafruit Unified Sensor']
        : []),
      ...(plan.items.some((i) => i.component.template === 'ssd1306')
        ? ['Adafruit GFX Library']
        : []),
    ]),
  ];
  const files: Record<string, string> = {
    'sketch.ino': code,
    'diagram.json': JSON.stringify(diagram, null, 2) + '\n',
    'libraries.txt': libraries.join('\n') + '\n',
    'README.md': `# CIRCUIT FORGE — Wokwi project

Board: ${plan.board.name}

1. Create a new Arduino/C++ project for the same board at https://wokwi.com.
2. Replace sketch.ino and diagram.json with the files in this package.
3. Add libraries.txt or install the listed libraries using Library Manager.
4. Press Play. The serial monitor uses 115200 baud.

${interactive ? 'If a potentiometer is present, the LED turns on above its midpoint; an OLED displays the raw ADC value. Button state is shown in the serial monitor.' : 'The code uses the standard telemetry template: the LED blinks and the potentiometer value is printed to the serial monitor.'}\n\n${notes.map((n) => '- ' + n).join('\n')}

This package is not uploaded to Wokwi automatically. Library/core versions depend on the Wokwi environment.

Sources: https://docs.wokwi.com/diagram-format and https://docs.wokwi.com/getting-started/supported-hardware
`,
    'physical-wiring.md': wiringMarkdown(plan),
    'manifest.json':
      JSON.stringify(
        {
          version: 1,
          boardId: plan.board.id,
          fqbn: plan.board.profile!.fqbn,
          mode: interactive ? 'pot-control' : 'telemetry',
          simulationOnly: true,
          notes,
          modules: plan.items.map((i) => ({
            id: i.component.id,
            pins: i.pins,
            address: i.selection.address ?? i.component.addresses[0] ?? null,
          })),
        },
        null,
        2,
      ) + '\n',
  };
  return {
    diagram,
    files,
    notes,
    interactive:
      interactive && plan.items.some((i) => i.component.id === 'pot-10k'),
  };
}
