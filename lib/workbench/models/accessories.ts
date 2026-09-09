import type { PhysicalModel, PinType } from '../physical.ts';

type Spec = {
  id: string;
  name: string;
  visual: string;
  size: [number, number];
  terminals: string[];
  type: string;
  voltage: number | null;
  guide: string;
  attrs?: Record<string, string>;
};
const specs: Spec[] = [
  {
    id: 'module-hc-sr04',
    name: 'HC-SR04 ultrasonic sensor',
    visual: 'sonar',
    size: [45, 20],
    terminals: ['VCC', 'TRIG', 'ECHO', 'GND'],
    type: 'wokwi-hc-sr04',
    voltage: 5,
    guide:
      'UNO: VCC → 5V, GND → GND, TRIG → D3, ECHO → D2. Send a ≥10 µs trigger; distance in cm is echo duration in µs / 58. The 5 V ECHO needs level shifting for a 3.3 V controller.',
  },
  {
    id: 'module-servo',
    name: 'Micro servo · 180° reference',
    visual: 'servo',
    size: [23, 12.2],
    terminals: ['PWM', 'V+', 'GND'],
    type: 'wokwi-servo',
    voltage: 5,
    guide:
      'Signal → D9; share GND with the controller. Use a suitable external 5 V supply for a real servo, sized for stall current. This model exports a standard 0–180° servo; it does not represent continuous-rotation motors.',
  },
  {
    id: 'module-mpu6050',
    name: 'MPU6050 IMU · reference breakout',
    visual: 'imu',
    size: [20, 16],
    terminals: ['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT'],
    type: 'wokwi-mpu6050',
    voltage: null,
    guide:
      'I²C: SDA → UNO A4, SCL → A5; default address 0x68, AD0 high selects 0x69. Verify the actual breakout supply and logic levels before physical wiring; generic GY-521 and Adafruit boards differ. XDA/XCL are not implemented by Wokwi.',
  },
  {
    id: 'module-lcd1602-i2c',
    name: 'LCD 16×2 · I²C backpack',
    visual: 'lcd',
    size: [80, 36],
    terminals: ['GND', 'VCC', 'SDA', 'SCL'],
    type: 'wokwi-lcd1602',
    voltage: 5,
    attrs: { pins: 'i2c', i2cAddress: '0x27' },
    guide:
      'UNO: VCC → 5V, GND → GND, SDA → A4, SCL → A5. Export uses the PCF8574T I²C configuration at 0x27, not the 16-pin parallel LCD. Physical backpack address and pin order can vary.',
  },
  {
    id: 'module-pir',
    name: 'PIR motion sensor',
    visual: 'pir',
    size: [32, 24],
    terminals: ['GND', 'OUT', 'VCC'],
    type: 'wokwi-pir-motion-sensor',
    voltage: null,
    guide:
      'OUT → a digital input such as D2; connect supply and common GND for the selected sensor. In Wokwi, click Simulate Motion to assert OUT. Default hold time is 5 seconds. Physical modules vary in supply range and retrigger behavior.',
  },
  {
    id: 'module-ldr',
    name: 'LDR light sensor · AO/DO module',
    visual: 'ldr',
    size: [32, 14],
    terminals: ['VCC', 'GND', 'DO', 'AO'],
    type: 'wokwi-photoresistor-sensor',
    voltage: 5,
    guide:
      'UNO reference: VCC → 5V, GND → GND, AO → A0; optional DO → D2. The exported model includes its divider, so do not add a second divider. Calibrate a physical module before treating readings as lux.',
  },
  {
    id: 'module-joystick',
    name: 'Two-axis analog joystick',
    visual: 'joystick',
    size: [34, 26],
    terminals: ['VCC', 'VERT', 'HORZ', 'SEL', 'GND'],
    type: 'wokwi-analog-joystick',
    voltage: 5,
    guide:
      'UNO: VCC → 5V, GND → GND, VERT → A0, HORZ → A1, SEL → D2 with INPUT_PULLUP. Both axes idle around half supply. Pressing the stick connects SEL to GND.',
  },
  {
    id: 'module-encoder',
    name: 'KY-040 rotary encoder',
    visual: 'encoder',
    size: [26, 19],
    terminals: ['CLK', 'DT', 'SW', 'VCC', 'GND'],
    type: 'wokwi-ky-040',
    voltage: 5,
    guide:
      'UNO: CLK → D2, DT → D3, SW → D4, VCC → 5V and GND → GND. Read both quadrature channels to determine direction; use INPUT_PULLUP for SW. The reference has 20 steps per revolution.',
  },
  {
    id: 'piezo-passive',
    name: 'Passive piezo buzzer',
    visual: 'buzzer',
    size: [12, 12],
    terminals: ['1', '2'],
    type: 'wokwi-buzzer',
    voltage: null,
    guide:
      'Negative terminal 1 → GND; positive terminal 2 → D8. Use tone(8, frequency) and noTone(8). This is a passive piezo reference, not a high-current speaker or an active buzzer.',
  },
  {
    id: 'ds18b20',
    name: 'DS18B20 digital thermometer',
    visual: 'thermometer',
    size: [5, 5],
    terminals: ['GND', 'DQ', 'VCC'],
    type: 'wokwi-ds18b20',
    voltage: null,
    guide:
      'Use powered 1-Wire mode: VCC → compatible supply, GND → GND, DQ → D2, with a 4.7 kΩ pull-up from DQ to VCC. Check the package drawing before a physical build; waterproof probe wire colors vary.',
  },
  {
    id: 'module-keypad',
    name: '4×4 membrane keypad',
    visual: 'keypad',
    size: [69, 77],
    terminals: ['R1', 'R2', 'R3', 'R4', 'C1', 'C2', 'C3', 'C4'],
    type: 'wokwi-membrane-keypad',
    voltage: null,
    guide:
      'A passive row/column matrix: R1–R4 → D9,D8,D7,D6 and C1–C4 → D5,D4,D3,D2. It has no VCC/GND terminal. Scan with the Keypad library; never treat row contacts as power pins.',
  },
  {
    id: 'neopixel-ws2812b',
    name: 'WS2812 addressable RGB pixel',
    visual: 'pixel',
    size: [5, 5],
    terminals: ['VDD', 'DOUT', 'VSS', 'DIN'],
    type: 'wokwi-neopixel',
    voltage: 5,
    guide:
      'VDD → 5V, VSS → GND, DIN → D6 through a 330–470 Ω series resistor. DOUT connects to the next pixel’s DIN. Use a suitable external supply for chains and level shifting for a 3.3 V data source.',
  },
];
function pinType(label: string): PinType {
  if (['GND', 'VSS'].includes(label)) return 'ground';
  if (['VCC', 'VDD', 'V+'].includes(label)) return 'power_in';
  if (['1', '2'].includes(label)) return 'passive';
  return 'gpio';
}
export const accessoryModels: PhysicalModel[] = specs.map((s) => {
  const [w, h] = s.size;
  const pitch = Math.min(2.54, (w - 1) / (s.terminals.length - 1));
  return {
    id: s.id,
    name: s.name,
    variant:
      'Documented simulator terminals · illustrative mechanical footprint',
    kind: 'module',
    body: {
      w,
      h,
      t: s.visual === 'servo' ? 20 : s.visual === 'buzzer' ? 8 : 1.6,
      color:
        s.visual === 'servo'
          ? '#267ac2'
          : s.visual === 'keypad'
            ? '#202a3c'
            : '#1a6e76',
      radius: 1,
    },
    origin: { x: w / 2, y: h / 2 },
    accessoryVisual: s.visual,
    connectionGuide: s.guide,
    logicVoltage: s.voltage,
    pins: s.terminals.map((label, i) => ({
      id: label,
      label,
      group: s.visual === 'keypad' ? 'Matrix ribbon' : 'Reference terminals',
      x: (w - (s.terminals.length - 1) * pitch) / 2 + i * pitch,
      y: h - 0.8,
      z: s.visual === 'servo' ? 2 : 3.6,
      type: pinType(label),
      ...(pinType(label) === 'ground' ? { voltage: 0 } : {}),
    })),
    features:
      s.visual === 'imu'
        ? [{ kind: 'ic', x: 7, y: 3, w: 4, h: 4, label: 'MPU6050' }]
        : [],
    sources: [
      {
        url: 'https://docs.wokwi.com/parts/' + s.type,
        what: 'Official simulator pin contract and behavior; checked 2026-09-09',
      },
      ...(s.visual === 'servo'
        ? [
            {
              url: 'https://docs.arduino.cc/learn/electronics/servo-motors/',
              what: 'Arduino servo control and power requirements',
            },
          ]
        : s.visual === 'sonar'
          ? [
              {
                url: 'https://learn.adafruit.com/ultrasonic-sonar-distance-sensors/pinouts',
                what: 'HC-SR04 pinout and 5 V echo level',
              },
            ]
          : s.visual === 'pixel'
            ? [
                {
                  url: 'https://learn.adafruit.com/adafruit-neopixel-uberguide/best-practices',
                  what: 'Data resistor, shared ground and logic levels',
                },
              ]
            : []),
    ],
    verification: {
      pinout: 'documented',
      mechanical: 'unverified',
      note: 'Terminal identities follow Wokwi documentation. Outline, terminal placement and package details are illustrative and must not be used for fabrication.',
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
      type: s.type,
      pins: Object.fromEntries(s.terminals.map((t) => [t, t])),
      attrs: s.attrs,
    },
  };
});
