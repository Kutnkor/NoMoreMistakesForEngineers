// One product list. Physical models are keyed by the hardware-catalogue id, so
// a board can never appear twice with two different descriptions.
//
// A catalogue entry without a physical model is still listed, but with every
// support flag false. Having a picture is not the same as having a verified
// pinout, and the library must show that difference.
import {
  boards as catalogBoards,
  components as catalogComponents,
} from '../hardware/catalog.ts';
import { productImages } from '../hardware/photos.ts';
import { WOKWI_BOARDS } from '../hardware/wokwi.ts';
import {
  NO_SUPPORT,
  type PhysicalModel,
  type SupportStatus,
} from './physical.ts';
import { accessoryModels } from './models/accessories.ts';
import { moduleModels } from './models/modules.ts';
import { boardModels } from './models/boards.ts';
import { breadboard830, partModels } from './models/parts.ts';

export const physicalModels: PhysicalModel[] = [
  breadboard830,
  ...boardModels,
  ...partModels,
  ...moduleModels,
  ...accessoryModels,
];

// Code generation and Wokwi export are NOT declared by hand: they are read back
// from the modules that actually implement them, so the table cannot drift.
for (const m of physicalModels) {
  const cat = catalogBoards.find((b) => b.id === m.id);
  m.logicVoltage = cat?.logicVoltage ?? m.logicVoltage ?? null;
  m.support.codeGeneration = Boolean(cat?.profile);
  m.support.wokwiExport = Boolean(
    WOKWI_BOARDS[m.id] || m.simulator || m.kind === 'breadboard',
  );
}

const byId = new Map(physicalModels.map((m) => [m.id, m]));

export const lookupModel = (id: string) => byId.get(id);

export type LibraryEntry = {
  id: string;
  name: string;
  variant: string;
  kind: 'breadboard' | 'board' | 'module' | 'part';
  family: string;
  description: string;
  support: SupportStatus;
  hasPhysicalModel: boolean;
  photo?: string;
  sourceUrl?: string;
  verificationNote?: string;
};

/** Everything the left-hand library shows, physical model or not. */
export function libraryEntries(): LibraryEntry[] {
  const out: LibraryEntry[] = [];
  const seen = new Set<string>();

  for (const m of physicalModels) {
    seen.add(m.id);
    const cat = catalogBoards.find((b) => b.id === m.id);
    out.push({
      id: m.id,
      name: m.name,
      variant: m.variant,
      kind: m.kind,
      family:
        cat?.family ?? (m.kind === 'part' ? 'Discrete parts' : 'Workbench'),
      description: cat?.description ?? m.variant,
      support: m.support,
      hasPhysicalModel: true,
      photo: m.photoId ? productImages[m.photoId]?.src : undefined,
      sourceUrl: m.sources[0]?.url ?? cat?.sourceUrl,
      verificationNote: m.verification.note,
    });
  }

  for (const b of catalogBoards) {
    if (seen.has(b.id)) continue;
    out.push({
      id: b.id,
      name: b.name,
      variant: b.name,
      kind: 'board',
      family: b.family,
      description: b.description,
      support: { ...NO_SUPPORT },
      hasPhysicalModel: false,
      photo: productImages[b.id]?.src,
      sourceUrl: b.sourceUrl,
      verificationNote:
        'No physical model yet: this board cannot be placed on the workbench.',
    });
  }

  for (const c of catalogComponents) {
    if (seen.has(c.id)) continue;
    out.push({
      id: c.id,
      name: c.name,
      variant: c.name,
      kind: 'module',
      family: c.category,
      description: c.description,
      support: { ...NO_SUPPORT },
      hasPhysicalModel: false,
      photo: productImages[c.id]?.src,
      sourceUrl: c.sourceUrl,
      verificationNote:
        'No physical model yet: this module cannot be placed on the workbench.',
    });
  }

  return out;
}

export const placeableIds = () => new Set(physicalModels.map((m) => m.id));
