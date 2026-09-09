// Physical models for development boards.
//
// VERIFICATION POLICY (see physical.ts):
//   - Pin ORDER, LABELS and PITCH come from the manufacturer pinout documents
//     linked in `sources` and are marked `documented`.
//   - Absolute XY offsets of the headers on the PCB come from the widely used
//     community footprints. They are self-consistent and correct in pitch and
//     relative spacing, but they have NOT been checked against an official
//     mechanical drawing, so they are marked `community`.
//   - Nothing here is derived by measuring a photograph.
import { unoCAD } from '../cad/uno-rev3e.ts';
import { megaCAD } from '../cad/mega-rev3e.ts';
import type { PhysicalModel, PhysicalPin, PinType } from '../physical.ts';

const P = 2.54; // 0.1 in header pitch

type Row = {
  label: string;
  type?: PinType;
  voltage?: number | null;
  note?: string;
};

/** Lay a straight header out along +x or +y and return its pins. */
function header(
  opts: {
    group: string;
    x: number;
    y: number;
    dx?: number;
    dy?: number;
    z: number;
    prefix: string;
  },
  rows: (string | Row)[],
): PhysicalPin[] {
  const { group, x, y, dx = P, dy = 0, z, prefix } = opts;
  return rows.map((r, i) => {
    const row: Row = typeof r === 'string' ? { label: r } : r;
    return {
      id: `${prefix}${i + 1}`,
      label: row.label,
      group,
      x: x + dx * i,
      y: y + dy * i,
      z,
      type: row.type ?? guessType(row.label),
      voltage: row.voltage,
      note: row.note,
    };
  });
}

function guessType(label: string): PinType {
  const l = label.toUpperCase();
  if (l === 'GND' || l === 'AGND') return 'ground';
  if (['5V', '3V3', '3.3V', 'VBUS', 'VSYS', '3V3(OUT)'].includes(l))
    return 'power_out';
  if (['VIN', 'VCC', 'VDD'].includes(l)) return 'power_in';
  if (l === 'RESET' || l === 'RST' || l === 'RUN' || l === 'EN') return 'reset';
  if (l === 'AREF' || l === 'IOREF' || l === 'ADC_VREF') return 'reference';
  if (l === 'NC' || l === 'RESERVED') return 'nc';
  if (/^A\d/.test(l) || l.includes('ADC') || l.startsWith('SENSOR_V'))
    return 'analog_in';
  return 'gpio';
}

const HEADER_Z = 8.6; // female header contact height above the table, UNO family
const PIN_Z = 3.0; // male header pin tip height for breadboard-mounted boards

// ---------------------------------------------------------------------------
// Arduino UNO R3
// ---------------------------------------------------------------------------
// The two digital headers are deliberately NOT on one continuous 0.1 in grid:
// there is a 0.16 in (4.06 mm) step between D7 and D8. That offset is the
// well-known reason a plain 0.1 in protoboard will not seat an UNO shield.
const UNO_TOP_Y = 50.8;
const UNO_BOT_Y = 2.54;
const UNO_H10_X = 15.24; // SCL .. D8
const UNO_H8_X = UNO_H10_X + 9 * P + P + 1.52; // 0.16 in step after D8

export const arduinoUnoR3: PhysicalModel = {
  id: 'uno-rev3',
  variant: 'Arduino UNO Rev3 (A000066)',
  kind: 'board',
  name: 'Arduino UNO R3',
  body: { w: 68.58, h: 53.34, t: 1.6, color: '#0f8b93', radius: 3 },
  origin: { x: 34.29, y: 26.67 },
  mounts: [
    { x: 13.97, y: 2.54, d: 3.2 },
    { x: 15.24, y: 50.8, d: 3.2 },
    { x: 66.04, y: 35.56, d: 3.2 },
    { x: 66.04, y: 7.62, d: 3.2 },
  ],
  header: {
    pitch: P,
    rowSpacing: 48.26,
    breadboardMountable: false,
    note: 'Female headers with a 0.16 in step between D7 and D8; the UNO sits beside the breadboard and is wired with jumpers.',
  },
  pins: [
    ...header(
      {
        group: 'POWER header',
        x: 12.7,
        y: UNO_BOT_Y,
        z: HEADER_Z,
        prefix: 'PWR',
      },
      [
        { label: 'RESERVED', type: 'nc' },
        {
          label: 'IOREF',
          type: 'reference',
          note: 'Tied to 5 V on the UNO R3.',
        },
        'RESET',
        { label: '3V3', voltage: 3.3 },
        { label: '5V', voltage: 5 },
        { label: 'GND', voltage: 0 },
        { label: 'GND', voltage: 0 },
        { label: 'VIN', type: 'power_in' },
      ],
    ),
    ...header(
      {
        group: 'ANALOG IN header',
        x: 35.56,
        y: UNO_BOT_Y,
        z: HEADER_Z,
        prefix: 'A',
      },
      ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'],
    ),
    ...header(
      {
        group: 'DIGITAL header (D8..SCL)',
        x: UNO_H10_X,
        y: UNO_TOP_Y,
        z: HEADER_Z,
        prefix: 'DH',
      },
      ['SCL', 'SDA', 'AREF', 'GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'],
    ),
    ...header(
      {
        group: 'DIGITAL header (D0..D7)',
        x: UNO_H8_X,
        y: UNO_TOP_Y,
        z: HEADER_Z,
        prefix: 'DL',
      },
      ['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'],
    ),
  ],
  internalNets: [
    {
      name: 'SDA',
      pins: ['A5', 'DH2'],
      source: 'UNO schematic: SDA header duplicates analog A4.',
    },
    {
      name: 'SCL',
      pins: ['A6', 'DH1'],
      source: 'UNO schematic: SCL header duplicates analog A5.',
    },
    {
      name: 'GND',
      pins: ['PWR6', 'PWR7', 'DH4'],
      source: 'Arduino UNO Rev3 schematic: all GND pads share one plane.',
    },
  ],
  features: [
    { kind: 'usb', x: 1.5, y: 30.5, w: 12, h: 16, style: 'b' },
    { kind: 'barrel', x: 1.5, y: 4.5, w: 13.8, h: 9 },
    { kind: 'ic', x: 25, y: 18, w: 34.5, h: 10, label: 'ATmega328P' },
    { kind: 'crystal', x: 18, y: 33, w: 11.4, h: 4.6 },
    { kind: 'button', x: 12, y: 46, d: 4.5, label: 'RESET' },
    { kind: 'led', x: 22, y: 44, color: '#ffb020', label: 'L' },
    { kind: 'led', x: 22, y: 40.5, color: '#4caf50', label: 'ON' },
    { kind: 'led', x: 26, y: 44, color: '#ffb020', label: 'TX' },
    { kind: 'led', x: 26, y: 40.5, color: '#ffb020', label: 'RX' },
    {
      kind: 'header',
      x: UNO_H10_X - 1.6,
      y: UNO_TOP_Y - 1.6,
      w: 10 * P,
      h: 3.2,
    },
    { kind: 'header', x: UNO_H8_X - 1.6, y: UNO_TOP_Y - 1.6, w: 8 * P, h: 3.2 },
    { kind: 'header', x: 12.7 - 1.6, y: UNO_BOT_Y - 1.6, w: 8 * P, h: 3.2 },
    { kind: 'header', x: 35.56 - 1.6, y: UNO_BOT_Y - 1.6, w: 6 * P, h: 3.2 },
    { kind: 'silk', x: 44, y: 26, text: 'UNO', size: 4 },
  ],
  sources: [
    {
      url: 'https://docs.arduino.cc/hardware/uno-rev3',
      what: 'Official product page, pinout and datasheet',
    },
    {
      url: 'https://content.arduino.cc/assets/UNO-TH_Rev3e_sch.pdf',
      what: 'UNO Rev3 schematic',
    },
  ],
  verification: {
    pinout: 'documented',
    mechanical: 'community',
    note: 'Pin order, labels and the 0.16 in D7/D8 step follow the Arduino documentation. Absolute header and mounting-hole offsets follow the community shield footprint and have not been checked against the official mechanical drawing.',
  },
  support: {
    visualModel: true,
    pinoutVerified: true,
    manualWiring: true,
    breadboardMount: false,
    codeGeneration: false,
    wokwiExport: false,
  },
  photoId: 'uno-rev3',
};

// Preserve stable endpoint IDs while replacing approximate UNO XY placement.
for (const pin of arduinoUnoR3.pins) {
  const match = /^(PWR|DH|DL|A)(\d+)$/.exec(pin.id)!;
  const group = ({ PWR: 'POWER', DH: 'IOH', DL: 'IOL', A: 'AD' } as const)[
    match[1] as 'PWR' | 'DH' | 'DL' | 'A'
  ];
  const index = Number(match[2]);
  const pad =
    match[1] === 'DH' ? 11 - index : match[1] === 'DL' ? 9 - index : index;
  const xy = (unoCAD.headers[group] as Record<string, number[]>)[String(pad)];
  pin.x = xy[0];
  pin.y = xy[1];
}
arduinoUnoR3.internalNets!.push({
  name: '5V / IOREF',
  pins: ['PWR2', 'PWR5'],
  source: 'Official UNO Rev3e Eagle signal +5V connects POWER pads 2 and 5.',
});
arduinoUnoR3.mounts = unoCAD.mounts;
arduinoUnoR3.verification.note =
  'UNO Rev3e PCB outline, holes, component and header XY locations are extracted from the official Arduino Eagle board. Package heights and connector interiors remain illustrative.';
arduinoUnoR3.sources.push({
  url: 'https://docs.arduino.cc/static/6bb7a3ca51ebee82a252f60c0b418787/A000066-cad-files.zip',
  what: 'Official UNO-TH_Rev3e.brd; XY and copper artwork, CC BY-SA 4.0',
});

// ---------------------------------------------------------------------------
// Arduino Nano (classic, ATmega328P)
// ---------------------------------------------------------------------------
const NANO_ROW = 15.24; // 0.6 in between header rows -> fits one breadboard

export const arduinoNano: PhysicalModel = {
  id: 'nano',
  variant: 'Arduino Nano 3.x (ATmega328P, mini-B USB)',
  kind: 'board',
  name: 'Arduino Nano',
  body: { w: 43.18, h: 18.0, t: 1.6, color: '#1b6f77', radius: 1 },
  origin: { x: 21.59, y: 9.0 },
  header: {
    pitch: P,
    rowSpacing: NANO_ROW,
    breadboardMountable: true,
    note: '0.6 in row spacing straddles the centre channel and leaves two free rows on each side.',
  },
  pins: [
    ...header(
      { group: 'Left header', x: 2.54, y: 1.38, z: PIN_Z, prefix: 'L' },
      [
        'D1/TX',
        'D0/RX',
        'RESET',
        'GND',
        'D2',
        'D3',
        'D4',
        'D5',
        'D6',
        'D7',
        'D8',
        'D9',
        'D10',
        'D11',
        'D12',
      ],
    ),
    ...header(
      {
        group: 'Right header',
        x: 2.54,
        y: 1.38 + NANO_ROW,
        z: PIN_Z,
        prefix: 'R',
      },
      [
        { label: 'VIN', type: 'power_in' },
        { label: 'GND', voltage: 0 },
        'RESET',
        { label: '5V', voltage: 5 },
        'A7',
        'A6',
        'A5',
        'A4',
        'A3',
        'A2',
        'A1',
        'A0',
        'AREF',
        { label: '3V3', voltage: 3.3 },
        'D13',
      ],
    ),
  ],
  internalNets: [
    {
      name: 'GND',
      pins: ['L4', 'R2'],
      source: 'Arduino Nano schematic: shared ground plane.',
    },
    {
      name: 'RESET',
      pins: ['L3', 'R3'],
      source: 'Both RESET pads are the same net on the Nano.',
    },
  ],
  features: [
    { kind: 'usb', x: -0.8, y: 5.2, w: 9, h: 7.6, style: 'mini' },
    { kind: 'ic', x: 14, y: 6, w: 9, h: 9, label: 'ATmega328P' },
    { kind: 'button', x: 34, y: 9, d: 3.5, label: 'RESET' },
    { kind: 'led', x: 27, y: 6.5, color: '#4caf50', label: 'PWR' },
    { kind: 'led', x: 27, y: 11, color: '#ffb020', label: 'L' },
    { kind: 'header', x: 1.3, y: 0.1, w: 15 * P, h: 2.6 },
    { kind: 'header', x: 1.3, y: NANO_ROW - 1.2, w: 15 * P, h: 2.6 },
  ],
  sources: [
    {
      url: 'https://docs.arduino.cc/hardware/nano',
      what: 'Official product page and pinout',
    },
  ],
  verification: {
    pinout: 'documented',
    mechanical: 'community',
    note: 'Pin order follows the Arduino Nano pinout diagram. The 0.6 in row spacing is a published figure; the board outline is the community footprint.',
  },
  support: {
    visualModel: true,
    pinoutVerified: true,
    manualWiring: true,
    breadboardMount: true,
    codeGeneration: false,
    wokwiExport: false,
  },
  photoId: 'nano',
};

// ---------------------------------------------------------------------------
// Arduino Mega 2560 R3
// ---------------------------------------------------------------------------
const MEGA_TOP_Y = 50.8;
const MEGA_BOT_Y = 2.54;

const megaDoubleRow = (): PhysicalPin[] => {
  // D22..D53 plus power on the far end: two rows of 18 contacts.
  const out: PhysicalPin[] = [];
  const x0 = 68.5;
  const odd = ['5V', ...Array.from({ length: 16 }, (_, i) => `D${23 + i * 2}`)];
  const even = [
    '5V',
    ...Array.from({ length: 16 }, (_, i) => `D${22 + i * 2}`),
  ];
  odd.push('GND');
  even.push('GND');
  odd.forEach((label, i) =>
    out.push({
      id: `X${i + 1}`,
      label,
      group: 'DIGITAL header (D22..D53)',
      x: x0 + i * P,
      y: MEGA_TOP_Y,
      z: HEADER_Z,
      type: guessType(label),
    }),
  );
  even.forEach((label, i) =>
    out.push({
      id: `Y${i + 1}`,
      label,
      group: 'DIGITAL header (D22..D53)',
      x: x0 + i * P,
      y: MEGA_TOP_Y - P,
      z: HEADER_Z,
      type: guessType(label),
    }),
  );
  return out;
};

export const arduinoMega2560: PhysicalModel = {
  id: 'mega-2560',
  variant: 'Arduino Mega 2560 Rev3 (A000067)',
  kind: 'board',
  name: 'Arduino Mega 2560 R3',
  body: { w: 101.52, h: 53.3, t: 1.6, color: '#0f8b93', radius: 3 },
  origin: { x: 50.76, y: 26.65 },
  mounts: [
    { x: 13.97, y: 2.54, d: 3.2 },
    { x: 15.24, y: 50.8, d: 3.2 },
    { x: 66.04, y: 35.56, d: 3.2 },
    { x: 66.04, y: 7.62, d: 3.2 },
    { x: 96.52, y: 2.54, d: 3.2 },
    { x: 90.17, y: 50.8, d: 3.2 },
  ],
  header: {
    pitch: P,
    rowSpacing: 48.26,
    breadboardMountable: false,
    note: 'Shield-compatible female headers; wired to a breadboard with jumpers.',
  },
  pins: [
    ...header(
      {
        group: 'POWER header',
        x: 12.7,
        y: MEGA_BOT_Y,
        z: HEADER_Z,
        prefix: 'PWR',
      },
      [
        { label: 'RESERVED', type: 'nc' },
        { label: 'IOREF', type: 'reference' },
        'RESET',
        { label: '3V3', voltage: 3.3 },
        { label: '5V', voltage: 5 },
        { label: 'GND', voltage: 0 },
        { label: 'GND', voltage: 0 },
        { label: 'VIN', type: 'power_in' },
      ],
    ),
    ...header(
      {
        group: 'ANALOG IN A0..A7',
        x: 35.56,
        y: MEGA_BOT_Y,
        z: HEADER_Z,
        prefix: 'AL',
      },
      ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'],
    ),
    ...header(
      {
        group: 'ANALOG IN A8..A15',
        x: 56.6,
        y: MEGA_BOT_Y,
        z: HEADER_Z,
        prefix: 'AH',
      },
      ['A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15'],
    ),
    ...header(
      {
        group: 'DIGITAL header (D8..SCL)',
        x: UNO_H10_X,
        y: MEGA_TOP_Y,
        z: HEADER_Z,
        prefix: 'DH',
      },
      ['SCL', 'SDA', 'AREF', 'GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'],
    ),
    ...header(
      {
        group: 'DIGITAL header (D0..D7)',
        x: UNO_H8_X,
        y: MEGA_TOP_Y,
        z: HEADER_Z,
        prefix: 'DL',
      },
      ['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'],
    ),
    ...header(
      {
        group: 'COMMUNICATION header (D14..D21)',
        x: 62.5,
        y: MEGA_TOP_Y,
        z: HEADER_Z,
        prefix: 'CM',
      },
      ['D21', 'D20', 'D19', 'D18', 'D17', 'D16', 'D15', 'D14'],
    ),
    ...megaDoubleRow(),
  ],
  internalNets: [
    {
      name: 'GND',
      pins: ['PWR6', 'PWR7', 'DH4', 'X18', 'Y18'],
      source: 'Arduino Mega 2560 Rev3 schematic: shared ground plane.',
    },
    {
      name: '5V',
      pins: ['PWR5', 'X1', 'Y1'],
      source: 'Mega 2560 Rev3 schematic: shared 5 V rail.',
    },
  ],
  features: [
    { kind: 'usb', x: 1.5, y: 30.5, w: 12, h: 16, style: 'b' },
    { kind: 'barrel', x: 1.5, y: 4.5, w: 13.8, h: 9 },
    { kind: 'ic', x: 40, y: 18, w: 16, h: 16, label: 'ATmega2560' },
    { kind: 'button', x: 12, y: 46, d: 4.5, label: 'RESET' },
    { kind: 'led', x: 22, y: 44, color: '#ffb020', label: 'L' },
    { kind: 'led', x: 22, y: 40.5, color: '#4caf50', label: 'ON' },
    { kind: 'silk', x: 60, y: 26, text: 'MEGA 2560', size: 4 },
  ],
  sources: [
    {
      url: 'https://docs.arduino.cc/hardware/mega-2560',
      what: 'Official product page and pinout',
    },
  ],
  verification: {
    pinout: 'documented',
    mechanical: 'community',
    note: 'Header order follows the Arduino Mega 2560 Rev3 pinout. Absolute offsets follow the community shield footprint.',
  },
  support: {
    visualModel: true,
    pinoutVerified: true,
    manualWiring: true,
    breadboardMount: false,
    codeGeneration: false,
    wokwiExport: false,
  },
  photoId: 'mega-2560',
};

// Mega header XY follows official Rev3e CAD; old endpoint IDs stay stable.
for (const pin of arduinoMega2560.pins) {
  const match = /^(PWR|AL|AH|DH|DL|CM|X|Y)(\d+)$/.exec(pin.id)!;
  const prefix = match[1],
    n = Number(match[2]);
  const group = (
    {
      PWR: 'POWER',
      AL: 'ADCL',
      AH: 'ADCH',
      DH: 'JP6',
      DL: 'PWML',
      CM: 'COMMUNICATION',
      X: 'XIO',
      Y: 'XIO',
    } as Record<string, string>
  )[prefix];
  const pad =
    prefix === 'DL'
      ? 9 - n
      : prefix === 'CM'
        ? n
        : prefix === 'X'
          ? n * 2
          : prefix === 'Y'
            ? n * 2 - 1
            : n;
  const xy = (megaCAD.headers as Record<string, Record<string, number[]>>)[
    group
  ][String(pad)];
  pin.x = xy[0];
  pin.y = xy[1];
}
arduinoMega2560.internalNets!.push(
  {
    name: '5V / IOREF',
    pins: ['PWR2', 'PWR5'],
    source: 'Official Mega Rev3e Eagle +5V signal.',
  },
  {
    name: 'SCL',
    pins: ['DH1', 'CM1'],
    source: 'Official Mega Rev3e Eagle SCL signal.',
  },
  {
    name: 'SDA',
    pins: ['DH2', 'CM2'],
    source: 'Official Mega Rev3e Eagle SDA signal.',
  },
);
arduinoMega2560.mounts = megaCAD.mounts;
arduinoMega2560.verification.note =
  'PCB outline, holes and header XY are taken from the official MEGA2560_Rev3e.brd. Package heights and materials are illustrative.';
arduinoMega2560.sources.push({
  url: 'https://docs.arduino.cc/static/00ab83283ad8f7aae17832d0fe1b1d51/A000067-cad-files.zip',
  what: 'Official MEGA2560_Rev3e.brd; CC BY-SA 4.0',
});

// ---------------------------------------------------------------------------
// ESP32-DevKitC V4 (38-pin, WROOM-32E)
// ---------------------------------------------------------------------------
// The J2/J3 header order is taken from the Espressif user guide. The 1.0 in row
// spacing does land on the hole grid of an 830-point board (rows A..I), but it
// leaves only ONE free row on one side, so jumpering is very tight.
const ESP_ROW = 25.4;

export const esp32DevKitCV4: PhysicalModel = {
  id: 'esp32-devkitc-v4',
  variant: 'ESP32-DevKitC V4 with ESP32-WROOM-32E, 38-pin',
  kind: 'board',
  name: 'ESP32-DevKitC V4',
  body: { w: 54.4, h: 27.9, t: 1.6, color: '#1c1c1c', radius: 1 },
  origin: { x: 27.2, y: 13.95 },
  header: {
    pitch: P,
    rowSpacing: ESP_ROW,
    breadboardMountable: true,
    note: '1.0 in row spacing spans rows A..I of an 830-point board, leaving a single free row on one side only. Two breadboards side by side are more practical.',
  },
  pins: [
    ...header(
      { group: 'J2 header', x: 3.6, y: 1.25, z: PIN_Z, prefix: 'J3_' },
      [
        { label: '3V3', voltage: 3.3 },
        { label: 'EN', type: 'reset' },
        { label: 'SENSOR_VP', type: 'analog_in', note: 'GPIO36, input only' },
        { label: 'SENSOR_VN', type: 'analog_in', note: 'GPIO39, input only' },
        { label: 'IO34', type: 'analog_in', note: 'Input only' },
        { label: 'IO35', type: 'analog_in', note: 'Input only' },
        'IO32',
        'IO33',
        'IO25',
        'IO26',
        'IO27',
        'IO14',
        'IO12',
        { label: 'GND', voltage: 0 },
        'IO13',
        { label: 'SD2', note: 'GPIO9, used by flash on most modules' },
        { label: 'SD3', note: 'GPIO10, used by flash on most modules' },
        { label: 'CMD', note: 'GPIO11, used by flash' },
        { label: '5V', voltage: 5 },
      ],
    ),
    ...header(
      {
        group: 'J3 header',
        x: 3.6,
        y: 1.25 + ESP_ROW,
        z: PIN_Z,
        prefix: 'J2_',
      },
      [
        { label: 'GND', voltage: 0 },
        'IO23',
        'IO22',
        { label: 'TXD0', note: 'GPIO1, UART0' },
        { label: 'RXD0', note: 'GPIO3, UART0' },
        'IO21',
        { label: 'GND', voltage: 0 },
        'IO19',
        'IO18',
        'IO5',
        'IO17',
        'IO16',
        'IO4',
        { label: 'IO0', type: 'gpio', note: 'Boot strapping pin' },
        'IO2',
        'IO15',
        { label: 'SD1', note: 'GPIO8, used by flash' },
        { label: 'SD0', note: 'GPIO7, used by flash' },
        { label: 'CLK', note: 'GPIO6, used by flash' },
      ],
    ),
  ],
  internalNets: [
    {
      name: 'GND',
      pins: ['J3_14', 'J2_1', 'J2_7'],
      source: 'ESP32-DevKitC V4 schematic: shared ground plane.',
    },
  ],
  features: [
    {
      kind: 'shield',
      x: 12.5,
      y: 8.5,
      w: 25.5,
      h: 18,
      label: 'ESP32-WROOM-32E',
    },
    { kind: 'antenna', x: 38.5, y: 9.5, w: 13, h: 16 },
    { kind: 'usb', x: 0.5, y: 10.5, w: 6.5, h: 8, style: 'micro' },
    { kind: 'button', x: 9, y: 3.5, d: 3.4, label: 'BOOT' },
    { kind: 'button', x: 9, y: 24.4, d: 3.4, label: 'EN' },
    { kind: 'led', x: 24, y: 3.5, color: '#e04b3a', label: 'PWR' },
    { kind: 'header', x: 2.3, y: 0, w: 19 * P, h: 2.5 },
    { kind: 'header', x: 2.3, y: ESP_ROW, w: 19 * P, h: 2.5 },
  ],
  sources: [
    {
      url: 'https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html',
      what: 'Espressif user guide: J2/J3 header tables and dimension files',
    },
  ],
  verification: {
    pinout: 'documented',
    mechanical: 'community',
    note: 'Header order follows the Espressif J2/J3 tables. Espressif publishes a DXF dimension file that has NOT been parsed here; body size and header offsets are commonly cited figures and should be confirmed before being used as manufacturing data.',
  },
  support: {
    visualModel: true,
    pinoutVerified: true,
    manualWiring: true,
    breadboardMount: true,
    codeGeneration: false,
    wokwiExport: false,
  },
  photoId: 'esp32-devkitc-v4',
};

// ---------------------------------------------------------------------------
// Raspberry Pi Pico (original RP2040, no wireless)
// ---------------------------------------------------------------------------
const PICO_ROW = 17.78; // 0.7 in

const picoLeft = [
  'GP0',
  'GP1',
  { label: 'GND', voltage: 0 },
  'GP2',
  'GP3',
  'GP4',
  'GP5',
  { label: 'GND', voltage: 0 },
  'GP6',
  'GP7',
  'GP8',
  'GP9',
  { label: 'GND', voltage: 0 },
  'GP10',
  'GP11',
  'GP12',
  'GP13',
  { label: 'GND', voltage: 0 },
  'GP14',
  'GP15',
] as (string | Row)[];

const picoRight = [
  { label: 'VBUS', voltage: 5, note: 'Micro-USB input, ~5 V' },
  { label: 'VSYS', type: 'power_in' as PinType },
  { label: 'GND', voltage: 0 },
  { label: '3V3_EN', type: 'reset' as PinType },
  { label: '3V3(OUT)', voltage: 3.3 },
  { label: 'ADC_VREF', type: 'reference' as PinType },
  { label: 'GP28', type: 'analog_in' as PinType, note: 'ADC2' },
  { label: 'AGND', voltage: 0, note: 'Analogue ground reference' },
  { label: 'GP27', type: 'analog_in' as PinType, note: 'ADC1' },
  { label: 'GP26', type: 'analog_in' as PinType, note: 'ADC0' },
  { label: 'RUN', type: 'reset' as PinType },
  'GP22',
  { label: 'GND', voltage: 0 },
  'GP21',
  'GP20',
  'GP19',
  'GP18',
  { label: 'GND', voltage: 0 },
  'GP17',
  'GP16',
] as (string | Row)[];

export const raspberryPiPico: PhysicalModel = {
  id: 'raspberry-pi-pico',
  variant: 'Raspberry Pi Pico (RP2040, no wireless, unpopulated headers)',
  kind: 'board',
  name: 'Raspberry Pi Pico',
  body: { w: 51.0, h: 21.0, t: 1.0, color: '#153a2f', radius: 2 },
  origin: { x: 25.5, y: 10.5 },
  mounts: [
    { x: 4.8, y: 3.4, d: 2.1 },
    { x: 4.8, y: 17.6, d: 2.1 },
    { x: 46.2, y: 3.4, d: 2.1 },
    { x: 46.2, y: 17.6, d: 2.1 },
  ],
  header: {
    pitch: P,
    rowSpacing: PICO_ROW,
    breadboardMountable: true,
    note: '0.7 in row spacing leaves one free row on each side of an 830-point board.',
  },
  pins: [
    // Physical pins 1..20 run down one long edge; 21..40 back up the other.
    ...header(
      { group: 'Header (pins 1-20)', x: 1.37, y: 1.61, z: PIN_Z, prefix: 'P' },
      picoLeft,
    ),
    ...header(
      {
        group: 'Header (pins 21-40)',
        x: 1.37 + 19 * P,
        y: 1.61 + PICO_ROW,
        dx: -P,
        z: PIN_Z,
        prefix: 'Q',
      },
      picoRight,
    ),
  ],
  internalNets: [
    {
      name: 'GND',
      pins: ['P3', 'P8', 'P13', 'P18', 'Q3', 'Q8', 'Q13', 'Q18'],
      source:
        'Raspberry Pi official documentation: ground pins include AGND at pin 33. https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/microcontrollers/pico-series/about_pico.adoc',
    },
  ],
  features: [
    { kind: 'usb', x: -0.6, y: 6.5, w: 5.6, h: 8, style: 'micro' },
    { kind: 'ic', x: 21, y: 8, w: 7, h: 7, label: 'RP2040' },
    { kind: 'ic', x: 31, y: 8.5, w: 6, h: 5, label: 'W25Q16' },
    { kind: 'button', x: 42, y: 10.5, d: 3.4, label: 'BOOTSEL' },
    { kind: 'led', x: 12, y: 15.5, color: '#4caf50', label: 'LED' },
    { kind: 'silk', x: 12, y: 10.5, text: 'Pico', size: 3 },
  ],
  sources: [
    {
      url: 'https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf',
      what: 'Raspberry Pi Pico datasheet: pinout and mechanical drawing',
    },
    {
      url: 'https://www.raspberrypi.com/documentation/microcontrollers/raspberry-pi-pico.html',
      what: 'Pico documentation',
    },
  ],
  verification: {
    pinout: 'documented',
    mechanical: 'community',
    note: 'Pin order and the 51 x 21 mm outline are published in the Pico datasheet. Header inset and feature positions here are approximate and have not been read off the datasheet drawing.',
  },
  support: {
    visualModel: true,
    pinoutVerified: true,
    manualWiring: true,
    breadboardMount: true,
    codeGeneration: false,
    wokwiExport: false,
  },
  photoId: 'raspberry-pi-pico',
};

export const boardModels: PhysicalModel[] = [
  arduinoUnoR3,
  arduinoNano,
  arduinoMega2560,
  esp32DevKitCV4,
  raspberryPiPico,
];
