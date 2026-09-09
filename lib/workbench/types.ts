// Shared workbench state. 2D and 3D render the same project; neither owns it.
import type { PhysicalModel } from './physical.ts';

export type Rotation = 0 | 90 | 180 | 270;

/** Position of an instance on the table, millimetres, plus its rotation. */
export type Transform = { x: number; y: number; rot: Rotation };

export type InstanceKind = 'breadboard' | 'board' | 'module' | 'part';

export type Instance = {
  /** Unique per workbench. Two UNOs never share pins, wires or selection. */
  id: string;
  /** Catalogue / model id. */
  modelId: string;
  kind: InstanceKind;
  /** User-visible name, e.g. 'UNO 1'. */
  name: string;
  transform: Transform;
  /**
   * Set when this instance is physically plugged into a breadboard.
   * Records exactly which physical pin sits in which hole.
   */
  mounted?: {
    boardInstanceId: string;
    pins: Record<string, string>; // pinId -> holeId
  };
  /** Component value for passive parts, so the tray and BOM stay accurate. */
  value?: number;
  unit?: string;
  tolerance?: number;
};

export type ConnectionEndpoint =
  | { kind: 'board-pin'; instanceId: string; pinId: string }
  | { kind: 'breadboard-hole'; instanceId: string; holeId: string }
  | { kind: 'component-pin'; instanceId: string; pinId: string };

export type BenchWire = {
  id: string;
  a: ConnectionEndpoint;
  b: ConnectionEndpoint;
  color: string;
  label?: string;
  /** Editable waypoints on the table plane, millimetres. */
  route: { x: number; y: number }[];
  /** Arc height used by the 3D view, millimetres. */
  lift?: number;
};

export type Workbench = {
  version: 2;
  title: string;
  instances: Instance[];
  wires: BenchWire[];
  /** Retained so existing breadboard examples keep their target circuit. */
  targetCircuitId?: string;
  target?: {
    title: string;
    pins: { endpoint: ConnectionEndpoint; net: string }[];
    values?: { instanceId: string; value: number }[];
  };
  firmware?: string;
  libraries?: string;
  lesson?: string;
};

export const emptyWorkbench = (): Workbench => ({
  version: 2,
  title: 'Untitled workbench',
  instances: [],
  wires: [],
});

export type ModelLookup = (modelId: string) => PhysicalModel | undefined;

export const sameEndpoint = (a: ConnectionEndpoint, b: ConnectionEndpoint) =>
  a.kind === b.kind &&
  a.instanceId === b.instanceId &&
  (a.kind === 'breadboard-hole'
    ? a.holeId === (b as typeof a).holeId
    : a.pinId === (b as { pinId: string }).pinId);

export const endpointKey = (e: ConnectionEndpoint) =>
  e.kind === 'breadboard-hole'
    ? `${e.instanceId}#${e.holeId}`
    : `${e.instanceId}@${e.pinId}`;
