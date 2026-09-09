import type { PhysicalModel } from '../physical.ts';

// These are explicitly simulator reference modules, not a claim that every
// SSD1306 breakout or DHT22 carrier has this footprint or voltage tolerance.
export const moduleModels: PhysicalModel[] = [
  {
    id: 'module-ssd1306',
    name: 'SSD1306 OLED',
    variant: 'Wokwi 128×64 I²C reference module · 0x3C',
    kind: 'module',
    body: { w: 27, h: 27, t: 1.6, color: '#183751' },
    origin: { x: 13.5, y: 13.5 },
    logicVoltage: 5,
    pins: ['GND', 'VCC', 'SCL', 'SDA'].map((label, i) => ({
      id: label,
      label,
      group: 'I²C header',
      x: 9.69 + i * 2.54,
      y: 25,
      z: 4,
      type:
        label === 'GND'
          ? ('ground' as const)
          : label === 'VCC'
            ? ('power_in' as const)
            : ('gpio' as const),
    })),
    features: [
      { kind: 'ic', x: 1.5, y: 2, w: 24, h: 18, label: '128 × 64' },
      { kind: 'silk', x: 5, y: 22, text: 'SSD1306', size: 2 },
    ],
    sources: [
      {
        url: 'https://docs.wokwi.com/parts/board-ssd1306',
        what: 'Wokwi reference pinout, 5 V UNO wiring and I²C address',
      },
    ],
    verification: {
      pinout: 'documented',
      mechanical: 'community',
      note: 'Simulator reference footprint. Actual breakout pin order and voltage tolerance vary by manufacturer.',
    },
    support: {
      visualModel: true,
      pinoutVerified: true,
      manualWiring: true,
      breadboardMount: false,
      codeGeneration: false,
      wokwiExport: true,
    },
    simulator: {
      type: 'board-ssd1306',
      pins: { GND: 'GND', VCC: 'VCC', SCL: 'SCL', SDA: 'SDA' },
    },
  },
  {
    id: 'module-dht22',
    name: 'DHT22 sensor',
    variant: 'Four-pin temperature / humidity sensor · simulator reference',
    kind: 'module',
    body: { w: 15.1, h: 25, t: 7.7, color: '#e5ebee' },
    origin: { x: 7.55, y: 12.5 },
    logicVoltage: null,
    pins: ['VCC', 'SDA', 'NC', 'GND'].map((label, i) => ({
      id: label,
      label,
      group: 'Front-facing pins',
      x: 3.74 + i * 2.54,
      y: 27,
      z: 1,
      type:
        label === 'GND'
          ? ('ground' as const)
          : label === 'VCC'
            ? ('power_in' as const)
            : label === 'NC'
              ? ('nc' as const)
              : ('gpio' as const),
    })),
    features: [{ kind: 'silk', x: 2, y: 10, text: 'DHT22', size: 2 }],
    sources: [
      {
        url: 'https://docs.wokwi.com/parts/wokwi-dht22',
        what: 'Digital sensor terminals and simulator behavior',
      },
    ],
    verification: {
      pinout: 'documented',
      mechanical: 'community',
      note: 'Data terminal is labelled SDA by Wokwi; this sensor does not use I²C. Use a pull-up resistor to the selected supply.',
    },
    support: {
      visualModel: true,
      pinoutVerified: true,
      manualWiring: true,
      breadboardMount: false,
      codeGeneration: false,
      wokwiExport: true,
    },
    simulator: {
      type: 'wokwi-dht22',
      pins: { GND: 'GND', VCC: 'VCC', SDA: 'SDA', NC: 'NC' },
    },
  },
];
