import { WOKWI_BOARDS } from '../hardware/wokwi.ts';
import { buildConnectivity, analyzeWorkbench } from './netlist.ts';
import { lookupModel } from './registry.ts';
import type { Instance, Workbench } from './types.ts';
import { serializeWorkbench } from './project.ts';

// Simulator terminal names are separate from physical header ids. Unmapped
// terminals block export: no guessed pin is ever silently substituted.
export function simulatorPin(i: Instance, pinId: string): string | undefined {
  const model = lookupModel(i.modelId)!;
  if (model.simulator) return model.simulator.pins[pinId];
  const pin = model.pins.find((p) => p.id === pinId);
  if (!pin) return undefined;
  const label = pin.label;
  if (i.modelId === 'raspberry-pi-pico') {
    if (
      /^GP\d+$/.test(label) ||
      ['VBUS', 'VSYS', 'RUN', '3V3_EN', 'ADC_VREF'].includes(label)
    )
      return label;
    if (label === '3V3(OUT)') return '3V3';
    if (label === 'AGND') return 'GND.7';
    if (label === 'GND')
      return (
        {
          P3: 'GND.1',
          P8: 'GND.2',
          P13: 'GND.3',
          P18: 'GND.4',
          Q18: 'GND.5',
          Q13: 'GND.6',
          Q3: 'GND.8',
        } as Record<string, string>
      )[pinId];
  }
  if (i.modelId === 'esp32-devkitc-v4') {
    const aliases: Record<string, string> = {
      SENSOR_VP: 'VP',
      SENSOR_VN: 'VN',
      TXD0: 'TX',
      RXD0: 'RX',
      SD2: 'D2',
      SD3: 'D3',
      SD1: 'D1',
      SD0: 'D0',
    };
    if (aliases[label]) return aliases[label];
    if (/^IO\d+$/.test(label)) return label.slice(2);
    if (['3V3', '5V', 'EN', 'CMD', 'CLK'].includes(label)) return label;
    if (label === 'GND')
      return `GND.${model.pins.filter((p) => p.label === 'GND').findIndex((p) => p.id === pinId) + 1}`;
  }
  if (['uno-rev3', 'nano', 'mega-2560'].includes(i.modelId)) {
    if (/^D\d+(\/.*)?$/.test(label)) return label.slice(1).split('/')[0];
    if (/^A\d+$/.test(label)) return label;
    if (label === 'SDA') return i.modelId === 'mega-2560' ? '20' : 'A4';
    if (label === 'SCL') return i.modelId === 'mega-2560' ? '21' : 'A5';
    if (label === '3V3') return '3.3V';
    if (['5V', 'AREF', 'VIN', 'IOREF'].includes(label)) return label;
    if (label === 'RESET') return 'RESET';
    if (label === 'GND')
      return `GND.${model.pins.filter((p) => p.label === 'GND').findIndex((p) => p.id === pinId) + 1}`;
  }
  return undefined;
}

export function exportSimulation(w: Workbench): {
  files: Record<string, string>;
  notes: string[];
} {
  const errors = analyzeWorkbench(w, lookupModel).filter(
    (i) => i.severity === 'error',
  );
  if (errors.length) throw Error(errors.map((i) => i.text).join(' '));
  const boards = w.instances.filter((i) => i.kind === 'board');
  if (boards.length !== 1)
    throw Error(
      'Firmware export currently requires exactly one controller. Save the complete multi-board workbench as JSON.',
    );
  const parts = w.instances
    .filter((i) => i.kind !== 'breadboard')
    .map((i) => {
      const m = lookupModel(i.modelId)!;
      const type = WOKWI_BOARDS[i.modelId]?.type ?? m.simulator?.type;
      if (!type)
        throw Error(
          `${i.name} has no supported simulation model. Analog filters remain available in Filter AI.`,
        );
      const attrs: Record<string, string> = { ...m.simulator?.attrs };
      if (i.modelId === 'part-resistor') attrs.value = String(i.value ?? 10000);
      if (i.modelId === 'part-led') attrs.color = 'red';
      return {
        id: i.id,
        type,
        left: Math.round(i.transform.x * 3),
        top: Math.round(i.transform.y * 3),
        rotate: i.transform.rot,
        attrs,
      };
    });
  const c = buildConnectivity(w, lookupModel),
    nets = new Map<string, string[]>();
  for (const i of w.instances)
    for (const p of lookupModel(i.modelId)!.pins) {
      const endpoint = {
        kind:
          i.kind === 'board'
            ? ('board-pin' as const)
            : ('component-pin' as const),
        instanceId: i.id,
        pinId: p.id,
      };
      const net = c.netOf(endpoint)!;
      const count = c.nets.get(net)?.length ?? 0;
      const used =
        count > 1 ||
        w.wires.some((wire) =>
          [wire.a, wire.b].some(
            (e) =>
              e.instanceId === i.id &&
              e.kind !== 'breadboard-hole' &&
              e.pinId === p.id,
          ),
        );
      if (!used) continue;
      const mapped = simulatorPin(i, p.id);
      if (!mapped)
        throw Error(
          `${i.name} · ${p.label} has no verified simulator terminal mapping.`,
        );
      nets.set(net, [...(nets.get(net) ?? []), `${i.id}:${mapped}`]);
    }
  const connections: [string, string, string, string[]][] = [];
  for (const members of nets.values()) {
    const unique = [...new Set(members)];
    for (const pin of unique.slice(1))
      connections.push([
        unique[0],
        pin,
        /GND/.test(pin) ? 'black' : 'green',
        [],
      ]);
  }
  const diagram = {
    version: 1,
    author: 'Circuit Forge',
    editor: 'wokwi',
    parts,
    connections,
  };
  const generated = generateFirmware(w);
  const code = w.firmware?.trim() || generated.code;
  if (!code)
    throw Error(
      generated.reason || 'Add firmware for this circuit before exporting.',
    );
  const notes = [
    'Breadboard copper is flattened into electrically equivalent connections; workbench.json preserves the original physical placement and wires.',
    'Run the project in Wokwi to check firmware behavior. Export is not proof of electrical or physical operation.',
  ];
  return {
    files: {
      'diagram.json': JSON.stringify(diagram, null, 2),
      'sketch.ino': code,
      'libraries.txt': w.libraries ?? generated.libraries,
      'workbench.json': serializeWorkbench(w),
      'README.md': `# ${w.title}\n\nCreate a Wokwi project for ${lookupModel(boards[0].modelId)!.name}, then replace diagram.json and sketch.ino and add libraries from libraries.txt. Press Run.\n\n${notes.join('\n\n')}\n`,
    },
    notes,
  };
}

export function generateFirmware(w: Workbench): {
  code: string;
  libraries: string;
  reason?: string;
} {
  if (w.instances.some((i) => lookupModel(i.modelId)?.accessoryVisual))
    return {
      code: '',
      libraries: '',
      reason:
        'This accessory exports to Wokwi. Use its connection guide and paste a matching sketch; automatic code generation does not cover it yet.',
    };
  const boards = w.instances.filter((i) => i.kind === 'board');
  if (boards.length !== 1 || boards[0].modelId !== 'uno-rev3')
    return {
      code: '',
      libraries: '',
      reason:
        'Automatic firmware currently covers UNO R3 with LED, button, potentiometer, SSD1306 and DHT22. Enter your own Arduino-compatible sketch for other supported controllers.',
    };
  const board = boards[0],
    c = buildConnectivity(w, lookupModel),
    m = lookupModel(board.modelId)!;
  const ep = (i: Instance, pinId: string) => ({
    kind:
      i.kind === 'board' ? ('board-pin' as const) : ('component-pin' as const),
    instanceId: i.id,
    pinId,
  });
  const direct = (i: Instance, pin: string) =>
    m.pins.find((p) => c.connected(ep(i, pin), ep(board, p.id)));
  // LED drive is traced through exactly one series resistor; passive components
  // are never collapsed into copper for this purpose.
  const ledPin = (i: Instance) => {
    for (const r of w.instances.filter((x) => x.modelId === 'part-resistor'))
      for (const [a, b] of [
        ['1', '2'],
        ['2', '1'],
      ])
        if (c.connected(ep(i, '1'), ep(r, a))) {
          const p = direct(r, b);
          if (p && /^D\d+$/.test(p.label)) return p.label.slice(1);
        }
    return undefined;
  };
  const onGround = (i: Instance, pin: string) =>
    m.pins.some(
      (p) => p.type === 'ground' && c.connected(ep(i, pin), ep(board, p.id)),
    );
  const on5V = (i: Instance, pin: string) =>
    m.pins.some(
      (p) => p.label === '5V' && c.connected(ep(i, pin), ep(board, p.id)),
    );
  for (const i of w.instances) {
    if (i.modelId === 'part-led' && !onGround(i, '2'))
      return {
        code: '',
        libraries: '',
        reason: `${i.name}: connect the cathode to ground.`,
      };
    if (
      i.modelId === 'part-potentiometer' &&
      (!onGround(i, '3') || !on5V(i, '1'))
    )
      return {
        code: '',
        libraries: '',
        reason: `${i.name}: connect CCW to GND and CW to 5 V.`,
      };
    if (i.modelId === 'part-button' && !onGround(i, '1') && !onGround(i, '2'))
      return {
        code: '',
        libraries: '',
        reason: `${i.name}: connect one switch contact to GND.`,
      };
    if (
      ['module-ssd1306', 'module-dht22'].includes(i.modelId) &&
      (!onGround(i, 'GND') || !on5V(i, 'VCC'))
    )
      return {
        code: '',
        libraries: '',
        reason: `${i.name}: this UNO example requires VCC at 5 V and GND connected.`,
      };
  }
  const declarations: string[] = [],
    setup: string[] = ['Serial.begin(115200);'],
    loop: string[] = [],
    libs: string[] = [];
  let oled = false;
  for (const i of w.instances) {
    const key = i.id.replace(/[^a-zA-Z0-9_]/g, '_');
    if (i.modelId === 'part-led') {
      const pin = ledPin(i);
      if (!pin)
        return {
          code: '',
          libraries: '',
          reason: `${i.name}: connect the anode through a resistor to a digital pin before generating code.`,
        };
      setup.push(`pinMode(${pin}, OUTPUT);`);
      loop.push(`digitalWrite(${pin}, (millis() / 500) % 2);`);
    }
    if (i.modelId === 'part-potentiometer') {
      const pin = direct(i, '2');
      if (!pin || !/^A\d+$/.test(pin.label))
        return {
          code: '',
          libraries: '',
          reason: `${i.name}: connect the wiper to an analog input.`,
        };
      loop.push(
        `Serial.print("${key}: "); Serial.println(analogRead(${pin.label}));`,
      );
    }
    if (i.modelId === 'part-button') {
      const pin = direct(i, '1') ?? direct(i, '2');
      if (!pin || !/^D\d+$/.test(pin.label))
        return {
          code: '',
          libraries: '',
          reason: `${i.name}: connect one contact to a digital input and the other to GND.`,
        };
      setup.push(`pinMode(${pin.label.slice(1)}, INPUT_PULLUP);`);
      loop.push(
        `Serial.print("${key} pressed: "); Serial.println(digitalRead(${pin.label.slice(1)}) == LOW);`,
      );
    }
    if (i.modelId === 'module-dht22') {
      const pin = direct(i, 'SDA');
      if (!pin || !/^D\d+$/.test(pin.label))
        return {
          code: '',
          libraries: '',
          reason: `${i.name}: connect the data terminal to a digital input.`,
        };
      declarations.push(
        `#include <DHT.h>\nDHT sensor_${key}(${pin.label.slice(1)}, DHT22);`,
      );
      setup.push(`sensor_${key}.begin();`);
      loop.push(
        `static unsigned long last_${key} = 0; if (millis() - last_${key} >= 2000) { last_${key} = millis(); Serial.print("Temperature C: "); Serial.println(sensor_${key}.readTemperature()); }`,
      );
      libs.push('DHT sensor library', 'Adafruit Unified Sensor');
    }
    if (i.modelId === 'module-ssd1306') {
      if (oled)
        return {
          code: '',
          libraries: '',
          reason: 'Automatic firmware supports one OLED at address 0x3C.',
        };
      oled = true;
      const sda = direct(i, 'SDA'),
        scl = direct(i, 'SCL');
      if (
        !sda ||
        !['SDA', 'A4'].includes(sda.label) ||
        !scl ||
        !['SCL', 'A5'].includes(scl.label)
      )
        return {
          code: '',
          libraries: '',
          reason: 'Connect OLED SDA to A4 and SCL to A5 on UNO.',
        };
      declarations.push(
        '#include <Wire.h>\n#include <Adafruit_GFX.h>\n#include <Adafruit_SSD1306.h>\nAdafruit_SSD1306 display(128, 64, &Wire, -1);',
      );
      setup.push(
        'if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { Serial.println("OLED initialization failed"); while (true) {} }',
        'display.clearDisplay(); display.setTextSize(1); display.setTextColor(SSD1306_WHITE); display.setCursor(0, 0); display.println("CIRCUIT FORGE"); display.display();',
      );
      libs.push('Adafruit SSD1306', 'Adafruit GFX Library');
    }
  }
  return {
    code: `// Generated from the current Circuit Forge pin connections.\n${declarations.join('\n')}\nvoid setup() {\n  ${setup.join('\n  ')}\n}\nvoid loop() {\n  ${loop.join('\n  ')}\n  delay(50);\n}\n`,
    libraries: [...new Set(libs)].join('\n') + '\n',
  };
}
