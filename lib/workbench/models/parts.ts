// Breadboards and discrete parts as physical models.
import { HEIGHT, PITCH, WIDTH } from '../../breadboard/model.ts';
import type { PhysicalModel, PhysicalPin } from '../physical.ts';

export const breadboard830: PhysicalModel = {
  id: 'breadboard-830',
  variant: 'Full-size 830 tie-point solderless breadboard',
  kind: 'breadboard',
  name: 'Breadboard 830',
  body: { w: WIDTH, h: HEIGHT, t: 9.4, color: '#efeade', radius: 2 },
  origin: { x: WIDTH / 2, y: HEIGHT / 2 },
  // Holes are not pins: they come from lib/breadboard/model.ts HOLE_MAP so the
  // existing copper-group model and its validation stay the single source.
  pins: [],
  header: { pitch: PITCH, rowSpacing: 7.62, breadboardMountable: false },
  sources: [
    {
      url: 'https://en.wikipedia.org/wiki/Breadboard',
      what: '0.1 in grid, five-hole strips, split power rails',
    },
  ],
  verification: {
    pinout: 'documented',
    mechanical: 'community',
    note: 'Grid pitch and the five-hole strip structure are standard. Overall outline follows the existing Breadboard Lab model.',
  },
  support: {
    visualModel: true,
    pinoutVerified: true,
    manualWiring: true,
    breadboardMount: false,
    codeGeneration: false,
    wokwiExport: true,
  },
};

const twoLead = (
  id: string,
  name: string,
  variant: string,
  w: number,
  h: number,
  color: string,
  z = 0.4,
): PhysicalModel => ({
  id,
  variant,
  kind: 'part',
  name,
  body: { w, h, t: 2.4, color },
  origin: { x: w / 2, y: h / 2 },
  pins: [
    { id: '1', label: '1', group: 'Leads', x: 0, y: h / 2, z, type: 'passive' },
    { id: '2', label: '2', group: 'Leads', x: w, y: h / 2, z, type: 'passive' },
  ],
  sources: [],
  verification: { pinout: 'documented', mechanical: 'community' },
  support: {
    visualModel: true,
    pinoutVerified: true,
    manualWiring: true,
    breadboardMount: true,
    codeGeneration: false,
    wokwiExport: true,
  },
});

export const partModels: PhysicalModel[] = [
  twoLead(
    'part-resistor',
    'Resistor',
    'Axial 1/4 W, 0.4 in body',
    5 * PITCH,
    2.4,
    '#c9b28a',
  ),
  twoLead(
    'part-capacitor-ceramic',
    'Ceramic capacitor',
    'Radial disc, 0.2 in lead spacing',
    2 * PITCH,
    4.2,
    '#3f6ea8',
  ),
  twoLead(
    'part-capacitor-film',
    'Film capacitor',
    'Boxed film, 0.2 in lead spacing',
    2 * PITCH,
    4.6,
    '#d8b23a',
  ),
  twoLead(
    'part-capacitor-electrolytic',
    'Electrolytic capacitor',
    'Radial can, 0.1 in lead spacing',
    PITCH,
    5.2,
    '#2f3a45',
  ),
  twoLead(
    'part-inductor',
    'Inductor',
    'Axial choke',
    4 * PITCH,
    3.2,
    '#6a5f52',
  ),
  twoLead('part-led', 'LED', '5 mm through-hole', 2 * PITCH, 5.0, '#e04b3a'),
  {
    id: 'part-button',
    variant: 'Tactile switch, 6 x 6 mm, 4-pin',
    kind: 'part',
    name: 'Tactile button',
    body: { w: 6.5, h: 6.5, t: 4.3, color: '#2b2b2b' },
    origin: { x: 3.25, y: 3.25 },
    pins: [
      {
        id: '1',
        label: '1',
        group: 'Switch',
        x: 0.25,
        y: 0.25,
        z: 0.4,
        type: 'passive',
      },
      {
        id: '2',
        label: '2',
        group: 'Switch',
        x: 6.25,
        y: 0.25,
        z: 0.4,
        type: 'passive',
      },
      {
        id: '3',
        label: '3',
        group: 'Switch',
        x: 0.25,
        y: 6.25,
        z: 0.4,
        type: 'passive',
      },
      {
        id: '4',
        label: '4',
        group: 'Switch',
        x: 6.25,
        y: 6.25,
        z: 0.4,
        type: 'passive',
      },
    ],
    internalNets: [
      {
        name: 'A',
        pins: ['1', '3'],
        source: '6x6 tactile switch: pins 1 and 3 are internally common.',
      },
      {
        name: 'B',
        pins: ['2', '4'],
        source: '6x6 tactile switch: pins 2 and 4 are internally common.',
      },
    ],
    sources: [],
    verification: { pinout: 'documented', mechanical: 'community' },
    support: {
      visualModel: true,
      pinoutVerified: true,
      manualWiring: true,
      breadboardMount: true,
      codeGeneration: false,
      wokwiExport: true,
    },
  },
  {
    id: 'part-potentiometer',
    variant: 'Single-turn 9 mm potentiometer, 0.1 in pins',
    kind: 'part',
    name: 'Potentiometer',
    body: { w: 9.5, h: 10.0, t: 6.0, color: '#3a3f45' },
    origin: { x: 4.75, y: 5 },
    pins: [
      {
        id: '1',
        label: 'CW',
        group: 'Track',
        x: 2.21,
        y: 1.2,
        z: 0.4,
        type: 'passive',
      },
      {
        id: '2',
        label: 'W',
        group: 'Track',
        x: 4.75,
        y: 1.2,
        z: 0.4,
        type: 'passive',
      },
      {
        id: '3',
        label: 'CCW',
        group: 'Track',
        x: 7.29,
        y: 1.2,
        z: 0.4,
        type: 'passive',
      },
    ],
    sources: [],
    verification: { pinout: 'documented', mechanical: 'community' },
    support: {
      visualModel: true,
      pinoutVerified: true,
      manualWiring: true,
      breadboardMount: true,
      codeGeneration: false,
      wokwiExport: false,
    },
  },
  {
    id: 'part-ic-dip8',
    variant: 'DIP-8 package, 0.3 in row spacing',
    kind: 'part',
    name: 'DIP-8 IC',
    body: { w: 4 * PITCH, h: 7.62, t: 3.4, color: '#2b3033' },
    origin: { x: 2 * PITCH, y: 3.81 },
    pins: ((): PhysicalPin[] => {
      const out: PhysicalPin[] = [];
      for (let i = 0; i < 4; i++)
        out.push({
          id: String(i + 1),
          label: String(i + 1),
          group: 'DIP-8',
          x: PITCH / 2 + i * PITCH,
          y: 0,
          z: 0.4,
          type: 'passive',
        });
      for (let i = 0; i < 4; i++)
        out.push({
          id: String(8 - i),
          label: String(8 - i),
          group: 'DIP-8',
          x: PITCH / 2 + i * PITCH,
          y: 7.62,
          z: 0.4,
          type: 'passive',
        });
      return out;
    })(),
    sources: [],
    verification: { pinout: 'documented', mechanical: 'documented' },
    support: {
      visualModel: true,
      pinoutVerified: true,
      manualWiring: true,
      breadboardMount: true,
      codeGeneration: false,
      wokwiExport: true,
    },
  },
];

const contracts: Record<
  string,
  { type: string; pins: Record<string, string> }
> = {
  'part-resistor': { type: 'wokwi-resistor', pins: { '1': '1', '2': '2' } },
  'part-led': { type: 'wokwi-led', pins: { '1': 'A', '2': 'C' } },
  'part-button': {
    type: 'wokwi-pushbutton',
    pins: { '1': '1.l', '3': '1.r', '2': '2.l', '4': '2.r' },
  },
  'part-potentiometer': {
    type: 'wokwi-potentiometer',
    pins: { '1': 'VCC', '2': 'SIG', '3': 'GND' },
  },
};
for (const m of partModels) {
  m.simulator = contracts[m.id];
  if (m.id === 'part-led') {
    m.pins[0].label = 'A (+)';
    m.pins[1].label = 'K (−)';
  }
  if (m.id === 'part-capacitor-electrolytic') {
    m.pins[0].label = '+';
    m.pins[1].label = '−';
  }
  if (
    m.id === 'part-resistor' ||
    m.id.startsWith('part-capacitor') ||
    m.id === 'part-led' ||
    m.id === 'part-inductor' ||
    m.id === 'part-potentiometer' ||
    m.id === 'part-ic-dip8'
  )
    m.header = {
      pitch: PITCH,
      rowSpacing: null,
      breadboardMountable: true,
      note: 'All leads must align with separate, available holes.',
    };
  if (m.id === 'part-button') {
    m.support.breadboardMount = false;
    m.verification.note =
      'Generic switch footprint; connect with jumpers. Internal terminal pairs follow the Wokwi switch contract.';
  }
}
export function defaultValue(id: string): { value?: number; unit?: string } {
  if (id === 'part-resistor' || id === 'part-potentiometer')
    return { value: 10000, unit: 'Ω' };
  if (id.startsWith('part-capacitor')) return { value: 1e-7, unit: 'F' };
  if (id === 'part-inductor') return { value: 0.001, unit: 'H' };
  return {};
}
