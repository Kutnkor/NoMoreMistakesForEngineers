import { boards, components } from '../lib/hardware/catalog.ts';
import { planHardware } from '../lib/hardware/planner.ts';
import { generateSketch } from '../lib/hardware/sketch.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve(process.argv[2] ?? '../../work/arduino-cli/generated');
const cases: {
  name: string;
  board: string;
  fqbn: string;
  parts: string[];
  path: string;
}[] = [];
function add(boardId: string, parts: string[], suffix: string) {
  const board = boards.find((b) => b.id === boardId)!;
  const name = (boardId + '_' + suffix).replace(/-/g, '_');
  const plan = planHardware(
    board,
    components,
    parts.map((componentId, i) => ({ id: 'm' + i, componentId })),
  );
  if (!plan.canGenerate) throw new Error(name + JSON.stringify(plan.issues));
  const path = resolve(out, name);
  mkdirSync(path, { recursive: true });
  writeFileSync(path + '/' + name + '.ino', generateSketch(plan));
  cases.push({ name, board: boardId, fqbn: board.profile!.fqbn, parts, path });
}
for (const b of boards.filter((b) => b.profile && b.id !== 'nano-esp32'))
  add(b.id, ['led-red', 'pot-10k', 'pushbutton'], 'basics');
for (const c of components.filter(
  (c) => c.template && c.template !== 'passive',
))
  add('uno-rev3', [c.id], c.id);
add('uno-rev3', ['bme280-adafruit', 'ssd1306-adafruit-128x64'], 'climate');
writeFileSync(resolve(out, 'matrix.json'), JSON.stringify(cases, null, 2));
console.log(cases.length + ' compile cases generated');
