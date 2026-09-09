// Physical, rendering-independent models for boards, modules and parts.
// Both the 2D SVG view and the 3D Three.js view derive from these definitions;
// there are deliberately no separate 2D/3D pin coordinates.
//
// All lengths are millimetres. The local frame is the table plane:
//   x -> along the board's long edge, y -> along the short edge,
//   z -> height above the table surface.
// Rendering maps this frame once, in lib/workbench/geometry.ts.

export type PinType =
  | 'ground'
  | 'power_out'
  | 'power_in'
  | 'gpio'
  | 'analog_in'
  | 'reset'
  | 'reference'
  | 'passive'
  | 'nc'
  | 'other';

export type PhysicalPin = {
  /** Unique inside the model. Two GND pins must have different ids. */
  id: string;
  /** Silkscreen label. Several pins may share a label. */
  label: string;
  /** Connector group as printed on the board, e.g. 'POWER header'. */
  group: string;
  /** Local coordinates on the table plane, millimetres. */
  x: number;
  y: number;
  /** Height of the connection point above the table, millimetres. */
  z: number;
  type: PinType;
  /** Nominal voltage for power pins; null when it depends on the supply. */
  voltage?: number | null;
  note?: string;
};

export type Feature =
  | {
      kind: 'header';
      x: number;
      y: number;
      w: number;
      h: number;
      label?: string;
    }
  | {
      kind: 'usb';
      x: number;
      y: number;
      w: number;
      h: number;
      style: 'b' | 'micro' | 'c' | 'mini';
    }
  | { kind: 'barrel'; x: number; y: number; w: number; h: number }
  | {
      kind: 'ic';
      x: number;
      y: number;
      w: number;
      h: number;
      label?: string;
      rotation?: number;
    }
  | {
      kind: 'shield';
      x: number;
      y: number;
      w: number;
      h: number;
      label?: string;
    }
  | { kind: 'button'; x: number; y: number; d: number; label?: string }
  | { kind: 'led'; x: number; y: number; color: string; label?: string }
  | { kind: 'antenna'; x: number; y: number; w: number; h: number }
  | { kind: 'crystal'; x: number; y: number; w: number; h: number }
  | {
      kind: 'silk';
      x: number;
      y: number;
      text: string;
      size?: number;
      rotation?: number;
    };

export type Mount = { x: number; y: number; d: number };

/** How far a product has actually been taken. A visual model alone proves nothing. */
export type SupportStatus = {
  visualModel: boolean;
  pinoutVerified: boolean;
  manualWiring: boolean;
  breadboardMount: boolean;
  codeGeneration: boolean;
  wokwiExport: boolean;
};

export const NO_SUPPORT: SupportStatus = {
  visualModel: false,
  pinoutVerified: false,
  manualWiring: false,
  breadboardMount: false,
  codeGeneration: false,
  wokwiExport: false,
};

/**
 * documented — taken from a manufacturer drawing, datasheet or official CAD file
 * community  — widely used community footprint; self-consistent but not checked
 *              against an official mechanical drawing
 * unverified — placeholder geometry; must not be treated as a measurement
 */
export type VerificationLevel = 'documented' | 'community' | 'unverified';

export type Source = { url: string; what: string };

export type HeaderSpec = {
  /** Centre-to-centre pin spacing, millimetres. */
  pitch: number;
  /** Distance between the two header rows, millimetres. Null for single-row. */
  rowSpacing: number | null;
  /** True only when the exact variant plugs into one standard breadboard. */
  breadboardMountable: boolean;
  note?: string;
};

export type PhysicalModel = {
  /** Matches the hardware catalogue id so there is only ever one product list. */
  id: string;
  /** The exact model and revision this definition represents. */
  variant: string;
  kind: 'board' | 'module' | 'breadboard' | 'part';
  name: string;
  body: { w: number; h: number; t: number; color: string; radius?: number };
  /** Rotation centre in local coordinates. */
  origin: { x: number; y: number };
  mounts?: Mount[];
  features?: Feature[];
  pins: PhysicalPin[];
  /** Documented internal connections, by pin id. Never inferred from labels. */
  internalNets?: { name: string; pins: string[]; source?: string }[];
  header?: HeaderSpec;
  sources: Source[];
  verification: {
    pinout: VerificationLevel;
    mechanical: VerificationLevel;
    note?: string;
  };
  support: SupportStatus;
  /** Optional photograph reference, reusing lib/hardware/photos.ts entries. */
  photoId?: string;
  logicVoltage?: number | null;
  accessoryVisual?: string;
  connectionGuide?: string;
  simulator?: {
    type: string;
    pins: Record<string, string>;
    attrs?: Record<string, string>;
  };
};

export const pinMap = (m: PhysicalModel) =>
  new Map(m.pins.map((p) => [p.id, p]));

/** Pins that share a documented internal net, as a lookup by pin id. */
export function internalGroupsOf(m: PhysicalModel): string[][] {
  return (m.internalNets ?? []).map((n) => n.pins);
}

export function pinsInGroup(m: PhysicalModel, group: string) {
  return m.pins.filter((p) => p.group === group);
}

export function groupsOf(m: PhysicalModel) {
  const out: string[] = [];
  for (const p of m.pins) if (!out.includes(p.group)) out.push(p.group);
  return out;
}

/** Rows of the model's bounding box, used for hit areas and fitting. */
export function bounds(m: PhysicalModel) {
  return { x: 0, y: 0, w: m.body.w, h: m.body.h };
}

export function supportScore(s: SupportStatus) {
  const keys: (keyof SupportStatus)[] = [
    'visualModel',
    'pinoutVerified',
    'manualWiring',
    'breadboardMount',
    'codeGeneration',
    'wokwiExport',
  ];
  return keys.filter((k) => s[k]).length;
}
