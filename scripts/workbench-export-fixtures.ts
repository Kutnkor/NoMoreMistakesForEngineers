// Optional online simulator contract check: generate these fixtures, then run
// wokwi-cli lint on each directory. This does not require a simulation token.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { demoWorkbench } from '../lib/workbench/examples.ts';
import {
  ACCESSORY_EXAMPLES,
  accessoryWorkbench,
} from '../lib/workbench/accessory-examples.ts';
import { accessoryModels } from '../lib/workbench/models/accessories.ts';
import { exportSimulation, simulatorPin } from '../lib/workbench/simulation.ts';
import { physicalModels } from '../lib/workbench/registry.ts';
import { WOKWI_BOARDS } from '../lib/hardware/wokwi.ts';
import type { Instance } from '../lib/workbench/types.ts';
const root = process.argv[2] ?? 'work/simulator-fixtures';
for (const [name, full] of [
  ['led', false],
  ['station', true],
] as const) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(
    exportSimulation(demoWorkbench(full)).files,
  ))
    writeFileSync(join(dir, name), text);
}
for (const model of physicalModels.filter((m) => m.kind === 'board')) {
  const inst: Instance = {
    id: 'controller',
    name: model.name,
    kind: 'board',
    modelId: model.id,
    transform: { x: 0, y: 0, rot: 0 },
  };
  const parts = [
    { id: 'controller', type: WOKWI_BOARDS[model.id].type, attrs: {} },
  ];
  const connections = model.pins.flatMap((p, index) => {
    const pin = simulatorPin(inst, p.id);
    if (!pin) return [];
    parts.push({ id: `r${index}`, type: 'wokwi-resistor', attrs: {} });
    return [[`controller:${pin}`, `r${index}:1`, 'green', []]];
  });
  const dir = join(root, model.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'diagram.json'),
    JSON.stringify({ version: 1, parts, connections }, null, 2),
  );
}
for (const ex of ACCESSORY_EXAMPLES) {
  const dir = join(root, ex.id);
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(
    exportSimulation(accessoryWorkbench(ex.id)).files,
  ))
    writeFileSync(join(dir, name), text);
}
for (const model of accessoryModels) {
  const parts = [
    {
      id: 'accessory',
      type: model.simulator!.type,
      attrs: model.simulator!.attrs ?? {},
    },
  ];
  const connections = model.pins.map((p, index) => {
    parts.push({ id: `r${index}`, type: 'wokwi-resistor', attrs: {} });
    return [
      `accessory:${model.simulator!.pins[p.id]}`,
      `r${index}:1`,
      'green',
      [],
    ];
  });
  const dir = join(root, model.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'diagram.json'),
    JSON.stringify({ version: 1, parts, connections }, null, 2),
  );
}
console.log(`Wrote 5 examples and 17 pin-contract fixtures to ${root}`);
