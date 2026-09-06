import { boards, components } from '../lib/hardware/catalog.ts';
import { planHardware } from '../lib/hardware/planner.ts';
import {
  createWokwiProject,
  WOKWI_BOARDS,
  WOKWI_PARTS,
} from '../lib/hardware/wokwi.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve(process.argv[2] ?? '../../work/wokwi-matrix');
const cases: {
    name: string;
    board: string;
    fqbn: string;
    parts: string[];
    path: string;
    compile: boolean;
  }[] = [],
  rejected: unknown[] = [];
for (const boardId of Object.keys(WOKWI_BOARDS)) {
  const board = boards.find((x) => x.id === boardId)!;
  for (const ids of [
    ...Object.keys(WOKWI_PARTS).map((x) => [x]),
    ['led-red', 'pot-10k', 'pushbutton', 'ssd1306-adafruit-128x64'],
  ]) {
    const plan = planHardware(
      board,
      components,
      ids.map((componentId, i) => ({ id: 'm' + i, componentId })),
    );
    if (!plan.canGenerate) {
      rejected.push({ board: boardId, parts: ids, issues: plan.issues });
      continue;
    }
    const e = createWokwiProject(plan),
      name = (
        boardId +
        '_' +
        (ids.length > 1 ? 'interactive' : ids[0])
      ).replace(/-/g, '_'),
      path = resolve(out, name);
    mkdirSync(path, { recursive: true });
    for (const [file, content] of Object.entries(e.files))
      writeFileSync(
        resolve(path, file === 'sketch.ino' ? name + '.ino' : file),
        content,
      );
    // Every supported pair gets diagram validation. Compile all modules on UNO,
    // ESP32 and Pico, plus the combined interactive example on Nano/Mega.
    cases.push({
      name,
      board: boardId,
      fqbn: board.profile!.fqbn,
      parts: ids,
      path,
      compile:
        ['uno-rev3', 'esp32-devkitc-v4', 'raspberry-pi-pico'].includes(
          boardId,
        ) || ids.length > 1,
    });
  }
}
writeFileSync(
  resolve(out, 'matrix.json'),
  JSON.stringify({ cases, rejected }, null, 2),
);
console.log(
  JSON.stringify({
    diagrams: cases.length,
    compiles: cases.filter((x) => x.compile).length,
    rejected: rejected.length,
  }),
);
