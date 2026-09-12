'use client';
// The electronics workbench: one project, two views, a searchable library that
// shows the whole catalogue and is honest about what is actually supported.
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useReducer,
} from 'react';
import {
  Box,
  Copy,
  Download,
  Link2,
  Maximize2,
  MousePointer2,
  Redo2,
  RotateCw,
  Save,
  Search,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { describeHole } from '@/lib/workbench/netlist';
import {
  analyzeWorkbench,
  buildConnectivity,
  describeEndpoint,
} from '@/lib/workbench/netlist';
import { endpointPoint, workbenchBounds } from '@/lib/workbench/geometry';
import {
  headerCompatible,
  moveInstance,
  previewMount,
  rotateInstance,
  alignToHoles,
} from '@/lib/workbench/mount';
import { libraryEntries, lookupModel } from '@/lib/workbench/registry';
import {
  parseWorkbench,
  serializeWorkbench,
  type History,
} from '@/lib/workbench/project';
import type {
  ConnectionEndpoint,
  Instance,
  Workbench,
} from '@/lib/workbench/types';
import { emptyWorkbench, endpointKey } from '@/lib/workbench/types';
import { saveFile } from '@/lib/save-file';
import { Bench2D, type View } from './bench-2d';
import {
  ACCESSORY_EXAMPLES,
  accessoryWorkbench,
} from '@/lib/workbench/accessory-examples';
import { SketchEditor } from './sketch-editor';
import { SignalPanel } from './signal-panel';
import { DiagnosisPanel } from './diagnosis-panel';
import { encodeProject, decodeProject } from '@/lib/workbench/sharing';
import { LOCAL_MODELS } from '@/lib/workbench/runtime/circuit';
import { explainCompilerIssue, type CodeIssue } from '@/lib/workbench/compiler';
import { RuntimePanel } from './runtime-panel';
import { EMPTY_FRAME } from '@/lib/workbench/runtime/circuit';
import type { CameraPose } from '@/lib/workbench/navigation';
import type { Bench3DApi } from './bench-3d';
import { sessionReducer, initialSession } from '@/lib/workbench/session';
import { defaultValue } from '@/lib/workbench/models/parts';
import { removeInstance, tidyWires, replaceWire } from '@/lib/workbench/edit';
import {
  compareTarget,
  previewTargetRepair,
  type TargetIssue,
} from '@/lib/workbench/target';
import {
  demoWorkbench,
  interactiveWorkbench,
  injectFault,
} from '@/lib/workbench/examples';
import { exportSimulation, generateFirmware } from '@/lib/workbench/simulation';
import { zipTextFiles } from '@/lib/zip';
import { EXAMPLES } from '@/lib/breadboard/circuits';
import { autoPlace } from '@/lib/breadboard/model';
import { migrateV1 } from '@/lib/workbench/project';
import { suggestedColor, WIRE_COLORS } from './draw';

const Bench3D = lazy(() => import('./bench-3d'));
class ThreeBoundary extends Component<
  { children: React.ReactNode; onReturn: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="wb-loading">
        <p>
          3D could not start on this device. Your project is still available.
        </p>
        <Button onClick={this.props.onReturn}>Return to 2D</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}

const nextId = (w: Workbench, prefix: string) => {
  let n = 1;
  while (w.instances.some((i) => i.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

const nextName = (w: Workbench, base: string) => {
  let n = 1;
  while (w.instances.some((i) => i.name === `${base} ${n}`)) n++;
  return `${base} ${n}`;
};

export function Workbench({
  initial,
  dark: initialDark = false,
  active = true,
}: {
  initial?: Workbench;
  dark?: boolean;
  active?: boolean;
}) {
  const [dark, setDark] = useState(initialDark);
  const [session, dispatch] = useReducer(
    sessionReducer,
    initial ?? demoWorkbench(),
    initialSession,
  );
  const { workbench, history } = session;
  const setWorkbench = useCallback(
    (w: Workbench) => dispatch({ type: 'load', workbench: w }),
    [],
  );
  const setHistory = useCallback(
    (change: (h: History) => History) => dispatch({ type: 'history', change }),
    [],
  );
  const [selection, setSelection] = useState<string | null>(null);
  const [selectedWire, setSelectedWire] = useState<string | null>(null);
  const [wireStart, setWireStart] = useState<ConnectionEndpoint | null>(null);
  const [hover, setHover] = useState<ConnectionEndpoint | null>(null);
  const [tool, setTool] = useState<'select' | 'wire' | 'probe'>('select');
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState('Opening local draft…');
  const [conflict, setConflict] = useState(false);
  const [placeableOnly, setPlaceableOnly] = useState(true);
  const [fullScreen, setFullScreen] = useState(false);
  const [pinnedNet, setPinnedNet] = useState<ConnectionEndpoint | null>(null);
  const [probe, setProbe] = useState<ConnectionEndpoint | null>(null);
  const [rewire, setRewire] = useState<{ id: string; side: 'a' | 'b' } | null>(
    null,
  );
  const [repair, setRepair] = useState<{
    next: Workbench;
    before: Workbench;
    text: string;
  } | null>(null);
  const [showDiagnosis, setShowDiagnosis] = useState(false);
  const [showSignals, setShowSignals] = useState(false);
  const [signalPin, setSignalPin] = useState(9);
  const [codeIssues, setCodeIssues] = useState<CodeIssue[]>([]);
  const [jump, setJump] = useState<{ line: number; nonce: number } | null>(
    null,
  );
  const [showWires, setShowWires] = useState(true);
  const [supportFilter, setSupportFilter] = useState('all');
  const [shareURL, setShareURL] = useState('');
  const [shared, setShared] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [runtime, setRuntime] = useState(EMPTY_FRAME);
  const [exercise, setExercise] = useState<{
    started: number;
    probes: number;
    attempts: number;
    elapsed?: number;
  } | null>(null);
  const writer = useRef('');
  const draftKey = 'circuit-forge-workbench-v2';
  const current = useRef(workbench);
  useEffect(() => {
    current.current = workbench;
  }, [workbench]);
  const savingAllowed = useRef(false);
  const persist = useCallback(() => {
    if (!savingAllowed.current) return;
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ writer: writer.current, project: current.current }),
      );
      setSaveState('Saved on this device');
    } catch {
      setSaveState('Local save unavailable — download your project');
    }
  }, []);
  /* oxlint-disable react/react-compiler -- Device-local draft hydration and storage-error reporting are external synchronization, not derived render state. */
  useEffect(() => {
    savingAllowed.current = false;
    writer.current = crypto.randomUUID();
    let disposed = false;
    let shareRequest = 0;
    const openShared = () => {
      if (!location.hash.startsWith('#cf1=')) return;
      const request = ++shareRequest;
      savingAllowed.current = false;
      setShared(true);
      setShareLoading(true);
      setSaveState('Shared snapshot — make a copy to save');
      void decodeProject(location.hash)
        .then((w) => {
          if (disposed || request !== shareRequest) return;
          current.current = w;
          setWorkbench(w);
          setShowCode(true);
          setShareLoading(false);
        })
        .catch((e) => {
          if (!disposed && request === shareRequest) {
            setNotice(`Share link could not be opened: ${e.message}`);
            setShareLoading(false);
          }
        });
    };
    addEventListener('hashchange', openShared);
    try {
      const isShared = location.hash.startsWith('#cf1=');
      if (isShared) openShared();
      const raw = localStorage.getItem(draftKey);
      if (raw && !initial && !isShared) {
        const restored = parseWorkbench(JSON.parse(raw).project);
        // Update the flush snapshot before React's next render. Strict Mode may
        // run cleanup immediately; it must never overwrite the loaded draft.
        current.current = restored;
        setWorkbench(restored);
      }
      savingAllowed.current = !isShared;
    } catch {
      setNotice(
        'The previous local draft could not be read. It has been retained; download the current project before replacing it.',
      );
      setConflict(true);
    }
    setReady(true);
    const changed = (e: StorageEvent) => {
      if (e.key !== draftKey || !e.newValue) return;
      try {
        if (JSON.parse(e.newValue).writer === writer.current) return;
      } catch {
        return;
      }
      savingAllowed.current = false;
      setConflict(true);
      setSaveState('Another tab saved this project');
    };
    const hide = () => persist();
    addEventListener('storage', changed);
    addEventListener('pagehide', hide);
    return () => {
      disposed = true;
      removeEventListener('hashchange', openShared);
      removeEventListener('storage', changed);
      removeEventListener('pagehide', hide);
      persist();
    };
  }, [persist, initial, setWorkbench]);
  /* oxlint-enable react/react-compiler */
  useEffect(() => {
    if (!ready || conflict) return;
    const timer = setTimeout(persist, 300);
    return () => clearTimeout(timer);
  }, [workbench, ready, conflict, persist]);
  const cameraPose = useRef<CameraPose | null>(null);
  const three = useRef<Bench3DApi | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const entries = useMemo(() => libraryEntries(), []);
  const conn = useMemo(
    () => buildConnectivity(workbench, lookupModel),
    [workbench],
  );
  const issues = useMemo(
    () => analyzeWorkbench(workbench, lookupModel),
    [workbench],
  );
  const targetIssues = useMemo(
    () => compareTarget(workbench, lookupModel),
    [workbench],
  );
  const selected = workbench.instances.find((i) => i.id === selection) ?? null;
  const selectedModel = selected ? lookupModel(selected.modelId) : null;

  const highlightNet = useMemo(() => {
    const e = pinnedNet ?? hover ?? wireStart ?? probe;
    return e ? conn.netOf(e) : null;
  }, [pinnedNet, hover, wireStart, probe, conn]);

  const apply = useCallback(
    (label: string, change: (w: Workbench) => Workbench, coalesce = false) =>
      dispatch({ type: 'edit', label, change, coalesce }),
    [],
  );

  // ---------------- library ----------------
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = entries.filter(
      (e) =>
        (!placeableOnly || e.hasPhysicalModel) &&
        (supportFilter === 'all' ||
          (supportFilter === 'local'
            ? LOCAL_MODELS.includes(e.id)
            : supportFilter === 'wokwi'
              ? e.support.wokwiExport && !LOCAL_MODELS.includes(e.id)
              : e.hasPhysicalModel && !e.support.wokwiExport)) &&
        (!q ||
          `${e.name} ${e.variant} ${e.family} ${e.id}`
            .toLowerCase()
            .includes(q)),
    );
    return [...list].sort(
      (a, b) =>
        Number(b.hasPhysicalModel) - Number(a.hasPhysicalModel) ||
        a.name.localeCompare(b.name),
    );
  }, [entries, query, placeableOnly, supportFilter]);

  const addInstance = (modelId: string) => {
    const model = lookupModel(modelId);
    if (!model) {
      setNotice(
        'That product has no physical model yet, so it cannot be placed on the workbench.',
      );
      return;
    }
    const newId = nextId(
      workbench,
      model.kind === 'breadboard' ? 'bb' : model.kind === 'part' ? 'p' : 'u',
    );
    setSelection(newId);
    setSelectedWire(null);
    setView({ x: 0, y: 0, scale: 1, focus: newId });
    apply('add', (w) => {
      const prefix =
        model.kind === 'breadboard' ? 'bb' : model.kind === 'part' ? 'p' : 'u';
      const id = nextId(w, prefix);
      // Drop new objects clear of everything already on the table.
      const b = w.instances.length
        ? workbenchBounds(w, lookupModel)
        : { x: 0, y: 0, w: 0, h: 0 };
      const inst: Instance = {
        id,
        modelId,
        kind: model.kind,
        name: nextName(w, model.name),
        transform: {
          x: b.x + b.w + 24 + model.origin.x,
          y: b.y + model.origin.y,
          rot: 0,
        },
        ...defaultValue(model.id),
      };
      return { ...w, instances: [...w.instances, inst] };
    });
  };

  // ---------------- wiring ----------------
  const pickEndpoint = (e: ConnectionEndpoint) => {
    if (e.kind === 'board-pin') {
      const inst = workbench.instances.find((i) => i.id === e.instanceId);
      if (inst && ['uno-rev3', 'nano'].includes(inst.modelId)) {
        const label =
          lookupModel(inst.modelId)?.pins.find((p) => p.id === e.pinId)
            ?.label ?? '';
        const match = /^([DA])(\d+)/.exec(label);
        if (match) setSignalPin(Number(match[2]) + (match[1] === 'A' ? 14 : 0));
      }
    }

    if (rewire) {
      apply('reconnect', (w) =>
        replaceWire(w, rewire.id, { [rewire.side]: e }),
      );
      setRewire(null);
      setWireStart(null);
      setTool('select');
      return;
    }
    if (tool === 'probe') {
      if (!probe) {
        setProbe(e);
        setNotice('First probe placed. Select a second terminal.');
      } else {
        setNotice(
          `${conn.connected(probe, e) ? 'Continuity: same conductor' : 'Open: different conductors'} · ${describeEndpoint(probe, workbench, lookupModel)} → ${describeEndpoint(e, workbench, lookupModel)}. Passive parts are not treated as copper.`,
        );
        setProbe(null);
        setExercise((x) => (x ? { ...x, probes: x.probes + 1 } : null));
      }
      return;
    }
    if (tool !== 'wire') {
      setSelection(e.instanceId);
      return;
    }
    if (!wireStart) {
      setWireStart(e);
      return;
    }
    if (endpointKey(wireStart) === endpointKey(e)) {
      setWireStart(null);
      return;
    }
    const label =
      e.kind === 'breadboard-hole'
        ? ''
        : (lookupModel(
            workbench.instances.find((i) => i.id === e.instanceId)?.modelId ??
              '',
          )?.pins.find((p) => p.id === e.pinId)?.label ?? '');
    const startLabel =
      wireStart.kind === 'breadboard-hole'
        ? ''
        : (lookupModel(
            workbench.instances.find((i) => i.id === wireStart.instanceId)
              ?.modelId ?? '',
          )?.pins.find((p) => p.id === wireStart.pinId)?.label ?? '');
    const a = wireStart;
    apply('wire', (w) => ({
      ...w,
      wires: [
        ...w.wires,
        {
          id: `w${w.wires.length + 1}-${Date.now().toString(36)}`,
          a,
          b: e,
          color: suggestedColor(startLabel || label),
          route: [],
        },
      ],
    }));
    setWireStart(null);
  };

  const doUndo = () => dispatch({ type: 'undo' });
  const doRedo = () => dispatch({ type: 'redo' });

  // ---------------- keyboard ----------------
  useEffect(() => {
    if (!active) return;
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      )
        return;
      if (ev.key === 'Escape') {
        setWireStart(null);
        setRewire(null);
        setProbe(null);
        setFullScreen(false);
        setTool('select');
      } else if (ev.key === 'r' || ev.key === 'R') {
        if (selection) apply('rotate', (w) => rotateInstance(w, selection));
      } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        if (selectedWire) {
          apply('delete-wire', (w) => ({
            ...w,
            wires: w.wires.filter((x) => x.id !== selectedWire),
          }));
          setSelectedWire(null);
        } else if (selection) {
          apply('delete', (w) => removeInstance(w, selection));
          setSelection(null);
        }
      } else if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) doRedo();
        else doUndo();
      } else if (ev.key === 'w' || ev.key === 'W') setTool('wire');
      else if (ev.key === 'v' || ev.key === 'V') setTool('select');
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const onMove = (id: string, dx: number, dy: number, done: boolean) => {
    if (done) {
      setHistory((h) => ({ ...h, lastLabel: undefined }));
      return;
    }
    apply(`move:${id}`, (w) => moveInstance(w, id, dx, dy), true);
  };

  const selectInstance = (id: string | null) => {
    setSelection(id);
    setSelectedWire(null);
  };
  const selectWire = (id: string | null) => {
    setSelectedWire(id);
    setSelection(null);
  };
  const focus = (id: string) => {
    selectInstance(id);
    setView({ x: 0, y: 0, scale: 1, focus: id });
    three.current?.focus(id);
  };
  const editWire = (
    id: string,
    patch: Partial<import('@/lib/workbench/types').BenchWire>,
    done = true,
  ) => {
    if (Object.keys(patch).length)
      apply(`wire-edit:${id}`, (w) => replaceWire(w, id, patch), !done);
    if (done) setHistory((h) => ({ ...h, lastLabel: undefined }));
  };
  const loadExample = (id: string) => {
    const ex = EXAMPLES.find((e) => e.id === id);
    const next =
      id === 'empty'
        ? emptyWorkbench()
        : ex
          ? migrateV1(ex.circuit, autoPlace(ex.circuit))
          : ACCESSORY_EXAMPLES.some((e) => e.id === id)
            ? accessoryWorkbench(id)
            : id === 'live'
              ? interactiveWorkbench()
              : demoWorkbench(id === 'station');
    if (id === 'led') next.firmware = generateFirmware(next).code;
    apply('load-example', () => next);
    if (id === 'live' || ACCESSORY_EXAMPLES.some((e) => e.id === id))
      setShowCode(true);
    cameraPose.current = null;
    requestAnimationFrame(() => three.current?.resetCamera());
    setView({ x: 0, y: 0, scale: 1 });
    selectInstance(null);
    setExercise(null);
    setRepair(null);
    setPinnedNet(null);
  };
  const locateIssue = (issue: TargetIssue) => {
    if (issue.instanceId) focus(issue.instanceId);
    if (issue.wireId) selectWire(issue.wireId);
    if (issue.endpoint) setPinnedNet(issue.endpoint);
    else if (issue.instanceId && issue.pinId)
      setPinnedNet({
        kind: 'board-pin',
        instanceId: issue.instanceId,
        pinId: issue.pinId,
      });
  };
  const previewRepair = (issue: TargetIssue) => {
    const proposal = previewTargetRepair(workbench, issue, lookupModel);
    const next = proposal?.next;
    if (
      !next ||
      analyzeWorkbench(next, lookupModel).filter((i) => i.severity === 'error')
        .length > issues.filter((i) => i.severity === 'error').length
    ) {
      setNotice(
        'No safe automatic jumper repair is available. Trace the highlighted connection.',
      );
      return;
    }
    setRepair({ next, before: workbench, text: proposal!.text });
    locateIssue(issue);
  };
  const downloadSimulation = () => {
    try {
      const p = exportSimulation(workbench);
      saveFile(
        'CircuitForge-simulation.zip',
        zipTextFiles(p.files),
        'application/zip',
      );
      setNotice(
        'Simulation project downloaded. Open Wokwi, import the files and press Run.',
      );
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const trySeat = () => {
    if (!selected || !selectedModel) return;
    const board = workbench.instances.find((i) => i.kind === 'breadboard');
    const boardModel = board && lookupModel(board.modelId);
    if (!board || !boardModel) {
      setNotice('Add a breadboard first.');
      return;
    }
    const check = previewMount(selected, selectedModel, board, boardModel);
    if (!check.ok) {
      setNotice(check.reason);
      return;
    }
    apply('seat', (w) => ({
      ...w,
      instances: w.instances.map((i) =>
        i.id === selected.id
          ? alignToHoles(i, selectedModel, board, boardModel, check.pins)
          : i,
      ),
    }));
    setNotice(
      `${selected.name} seated: ${Object.entries(check.pins)
        .slice(0, 3)
        .map(([pin, hole]) => `${pin}→${hole}`)
        .join(', ')} … ${check.note ?? ''}`,
    );
  };

  // ---------------- export ----------------
  const guide = () =>
    [
      `# ${workbench.title}`,
      '',
      '## Objects',
      ...workbench.instances.map(
        (i) => `- ${i.name} — ${lookupModel(i.modelId)?.variant ?? i.modelId}`,
      ),
      '',
      '## Connections',
      ...workbench.wires.map((w) => {
        const a = workbench.instances.find((i) => i.id === w.a.instanceId);
        const b = workbench.instances.find((i) => i.id === w.b.instanceId);
        const pinName = (e: ConnectionEndpoint) =>
          e.kind === 'breadboard-hole'
            ? describeHole(e.holeId)
            : (lookupModel(
                workbench.instances.find((i) => i.id === e.instanceId)
                  ?.modelId ?? '',
              )?.pins.find((p) => p.id === e.pinId)?.label ?? e.pinId);
        return `- ${a?.name} → ${pinName(w.a)} → ${b?.name} → ${pinName(w.b)}`;
      }),
      '',
      '## Seated on the breadboard',
      ...workbench.instances
        .filter((i) => i.mounted)
        .map(
          (i) =>
            `- ${i.name}: ${Object.entries(i.mounted!.pins)
              .map(([pin, hole]) => `${pin}→${hole}`)
              .join(', ')}`,
        ),
    ].join('\n');

  const hoverText = hover
    ? describeEndpoint(hover, workbench, lookupModel)
    : wireStart
      ? `From ${describeEndpoint(wireStart, workbench, lookupModel)} — click a second point, Esc to cancel`
      : '';

  return (
    <div
      className="wb-root"
      data-fullscreen={fullScreen || undefined}
      data-dark={dark || undefined}
    >
      <div className="wb-projectbar">
        <div>
          <strong>
            CIRCUIT FORGE <span>WORKBENCH</span>
          </strong>
          <small>{saveState}</small>
        </div>
        <input
          className="wb-projectname"
          aria-label="Project title"
          value={workbench.title}
          onChange={(e) =>
            apply('rename', (w) => ({ ...w, title: e.target.value }))
          }
        />
        <input
          className="wb-projectname"
          aria-label="Project description"
          placeholder="Short project description"
          value={workbench.lesson ?? ''}
          maxLength={500}
          onChange={(e) =>
            apply('description', (w) => ({ ...w, lesson: e.target.value }))
          }
        />
        <select
          aria-label="Load example"
          value=""
          onChange={(e) => loadExample(e.target.value)}
        >
          <option value="" disabled>
            Open an example…
          </option>
          <option value="live">UNO live inputs · run code</option>
          <option value="led">UNO LED starter</option>
          <option value="station">UNO sensor station</option>
          {ACCESSORY_EXAMPLES.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
          {EXAMPLES.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
          <option value="empty">Empty workbench</option>
        </select>
        <Button size="sm" variant="ghost" onClick={() => setDark(!dark)}>
          {dark ? 'Light theme' : 'Dark theme'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setFullScreen(!fullScreen)}
        >
          <Maximize2 size={15} />
          {fullScreen ? 'Exit full screen' : 'Full screen'}
        </Button>
      </div>
      {shared && (
        <div className="wb-share">
          <b>
            {shareLoading
              ? 'Opening shared project…'
              : 'Shared project snapshot'}
          </b>
          <span>Explore this copy without replacing your saved draft.</span>
          <Button
            size="sm"
            disabled={shareLoading}
            onClick={() => {
              try {
                const previous = localStorage.getItem(draftKey);
                if (previous)
                  localStorage.setItem(draftKey + '-backup', previous);
                savingAllowed.current = true;
                setShared(false);
                window.history.replaceState(
                  null,
                  '',
                  location.pathname + location.search,
                );
                persist();
              } catch {
                setNotice(
                  'Could not save a local copy. Export JSON to keep it.',
                );
              }
            }}
          >
            Make a copy
          </Button>
        </div>
      )}
      <div className="wb-starts">
        <b>Try a circuit</b>
        <button
          onClick={() => {
            loadExample('led');
            setShowCode(true);
          }}
        >
          Light an LED
        </button>
        <button
          onClick={() => {
            loadExample('distance-servo');
            setShowCode(true);
          }}
        >
          Read a sensor
        </button>
        <button
          onClick={() => {
            const base = demoWorkbench();
            base.firmware = generateFirmware(base).code;
            apply('fault-starter', () => injectFault(base).workbench);
            setShowDiagnosis(true);
            setTool('probe');
          }}
        >
          Find a fault
        </button>
        <button
          onClick={() => {
            loadExample('sk-lp');
            setShowDiagnosis(true);
          }}
        >
          Explore Fault AI
        </button>
      </div>
      {conflict && (
        <div className="wb-conflict" role="alert">
          Local saving is paused to preserve the other draft.{' '}
          <Button
            size="sm"
            onClick={() => {
              try {
                const raw = localStorage.getItem(draftKey);
                if (raw)
                  apply('load-other-draft', () =>
                    parseWorkbench(JSON.parse(raw).project),
                  );
                setConflict(false);
                savingAllowed.current = true;
              } catch {
                setNotice(
                  'Draft could not be read. Download your project to keep it.',
                );
              }
            }}
          >
            Load saved draft
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              savingAllowed.current = true;
              setConflict(false);
              persist();
            }}
          >
            Keep this draft
          </Button>
        </div>
      )}
      {/* ---------------- toolbar ---------------- */}
      <div className="wb-toolbar">
        <div className="wb-tools">
          <Button
            size="sm"
            variant={tool === 'select' ? 'default' : 'ghost'}
            onClick={() => setTool('select')}
            title="Select (V)"
          >
            <MousePointer2 size={15} /> Select
          </Button>
          <Button
            size="sm"
            variant={tool === 'wire' ? 'default' : 'ghost'}
            onClick={() => setTool('wire')}
            title="Wire (W)"
          >
            <Link2 size={15} /> Wire
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!selection}
            onClick={() =>
              selection && apply('rotate', (w) => rotateInstance(w, selection))
            }
            title="Rotate (R)"
          >
            <RotateCw size={15} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!selection}
            onClick={() =>
              selection &&
              apply('duplicate', (w) => {
                const src = w.instances.find((i) => i.id === selection)!;
                const model = lookupModel(src.modelId)!;
                const id = nextId(
                  w,
                  src.kind === 'breadboard'
                    ? 'bb'
                    : src.kind === 'part'
                      ? 'p'
                      : 'u',
                );
                return {
                  ...w,
                  instances: [
                    ...w.instances,
                    {
                      ...src,
                      id,
                      name: nextName(w, model.name),
                      mounted: undefined,
                      transform: {
                        ...src.transform,
                        x: src.transform.x + 12,
                        y: src.transform.y + 12,
                      },
                    },
                  ],
                };
              })
            }
            title="Duplicate"
          >
            <Copy size={15} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!selection && !selectedWire}
            onClick={() =>
              dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
            }
            title="Delete"
          >
            <Trash2 size={15} />
          </Button>
          <Button
            size="sm"
            variant={tool === 'probe' ? 'default' : 'ghost'}
            onClick={() => {
              setTool('probe');
              setProbe(null);
            }}
          >
            Probe
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => apply('tidy-wires', tidyWires)}
          >
            Tidy wires
          </Button>
          <span className="wb-sep" />
          <Button
            size="sm"
            variant="ghost"
            disabled={!history.past.length}
            onClick={doUndo}
            title="Undo"
          >
            <Undo2 size={15} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!history.future.length}
            onClick={doRedo}
            title="Redo"
          >
            <Redo2 size={15} />
          </Button>
        </div>
        <div className="wb-tools">
          <Button
            size="sm"
            variant={mode === '2d' ? 'default' : 'ghost'}
            onClick={() => setMode('2d')}
          >
            2D
          </Button>
          <Button
            size="sm"
            variant={mode === '3d' ? 'default' : 'ghost'}
            onClick={() => setMode('3d')}
          >
            <Box size={15} /> 3D
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              mode === '3d'
                ? three.current?.resetCamera()
                : setView({ x: 0, y: 0, scale: 1 })
            }
            title="Fit to workspace"
          >
            <Maximize2 size={15} /> Fit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!selection}
            onClick={() => selection && focus(selection)}
          >
            Focus
          </Button>
          <label className="wb-check">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
            />{' '}
            Pin labels
          </label>
          <label className="wb-check">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
            />{' '}
            Grid
          </label>
          <span className="wb-sep" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              saveFile(
                'workbench.json',
                serializeWorkbench(workbench),
                'application/json',
              )
            }
            title="Save project"
          >
            <Save size={15} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fileRef.current?.click()}
            title="Import project"
          >
            <Upload size={15} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              saveFile('assembly-guide.md', guide(), 'text/markdown')
            }
            title="Export assembly guide"
          >
            <Download size={15} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCode(!showCode)}
          >
            Code & Run
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowDiagnosis(!showDiagnosis)}
          >
            Diagnose my circuit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowSignals(!showSignals)}
          >
            Signals
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void encodeProject(workbench)
                .then((hash) => {
                  const url = location.origin + location.pathname + '#' + hash;
                  setShareURL(url);
                  return navigator.clipboard?.writeText(url);
                })
                .then(() =>
                  setNotice(
                    'Share link ready. It contains this circuit and code; recipients need access to this site.',
                  ),
                )
                .catch((e) => setNotice(e.message))
            }
          >
            Share project
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowWires(!showWires)}
          >
            {showWires ? 'Hide wires' : 'Show wires'}
          </Button>
          <Button size="sm" onClick={downloadSimulation}>
            Export simulation
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (ev) => {
              const f = ev.target.files?.[0];
              if (!f) return;
              try {
                const next = parseWorkbench(JSON.parse(await f.text()));
                apply('import', () => next);
                setView({ x: 0, y: 0, scale: 1 });
                selectInstance(null);
                setRepair(null);
                setExercise(null);
                setNotice(
                  `Loaded ${next.instances.length} objects and ${next.wires.length} wires.`,
                );
              } catch (e) {
                setNotice(`Import failed: ${(e as Error).message}`);
              }
              ev.target.value = '';
            }}
          />
        </div>
      </div>

      {shareURL && (
        <div className="wb-share">
          <span>Project link</span>
          <input
            aria-label="Project share link"
            readOnly
            value={shareURL}
            onFocus={(e) => e.target.select()}
          />
          <Button size="sm" variant="ghost" onClick={() => setShareURL('')}>
            Close
          </Button>
        </div>
      )}
      {showDiagnosis && (
        <DiagnosisPanel
          workbench={workbench}
          onLocate={locateIssue}
          onRepair={previewRepair}
        />
      )}
      {showSignals && (
        <SignalPanel frame={runtime} pin={signalPin} onPin={setSignalPin} />
      )}
      <div className="wb-program" hidden={!showCode}>
        <RuntimePanel
          onIssues={setCodeIssues}
          workbench={workbench}
          onFrame={setRuntime}
          active={active}
        />
        {showCode && (
          <section className="wb-code">
            <div>
              <b>Arduino sketch</b>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const g = generateFirmware(workbench);
                  if (g.code)
                    apply('generate-code', (w) => ({
                      ...w,
                      firmware: g.code,
                      libraries: g.libraries,
                    }));
                  else setNotice(g.reason ?? 'No generator available.');
                }}
              >
                Generate from current wiring
              </Button>
              <a href="https://wokwi.com/" target="_blank" rel="noreferrer">
                Open Wokwi ↗
              </a>
            </div>
            <SketchEditor
              value={workbench.firmware ?? ''}
              issues={codeIssues}
              jump={jump}
              onChange={(value) => {
                apply('code', (w) => ({ ...w, firmware: value }), true);
                setCodeIssues([]);
              }}
            />
            {!!codeIssues.length && (
              <div className="wb-errors">
                {codeIssues.map((issue, index) => (
                  <button
                    key={index}
                    onClick={() =>
                      setJump({ line: issue.line, nonce: Date.now() })
                    }
                  >
                    Line {issue.line}: {issue.message}
                    <br />
                    <small>{explainCompilerIssue(issue.message)}</small>
                  </button>
                ))}
              </div>
            )}
            <label>
              Libraries (one per line)
              <textarea
                aria-label="Arduino libraries"
                value={workbench.libraries ?? ''}
                onChange={(e) =>
                  apply(
                    'libraries',
                    (w) => ({ ...w, libraries: e.target.value }),
                    true,
                  )
                }
              />
            </label>
          </section>
        )}
      </div>
      <div className="wb-body">
        {/* ---------------- library ---------------- */}
        <aside className="wb-lib">
          <div className="wb-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search boards, modules, parts"
              aria-label="Search the library"
            />
          </div>
          <label className="wb-check wb-filter">
            <input
              type="checkbox"
              checked={placeableOnly}
              onChange={(e) => setPlaceableOnly(e.target.checked)}
            />{' '}
            Ready to place only
          </label>
          <select
            aria-label="Simulation support filter"
            value={supportFilter}
            onChange={(e) => setSupportFilter(e.target.value)}
          >
            <option value="all">All support levels</option>
            <option value="local">Runs in this app</option>
            <option value="wokwi">Wokwi export</option>
            <option value="visual">Placement only</option>
          </select>
          <div className="wb-liblist">
            {filtered.slice(0, 140).map((e) => (
              <button
                key={e.id}
                className="wb-libitem"
                data-ready={e.hasPhysicalModel || undefined}
                disabled={!e.hasPhysicalModel}
                onClick={() => addInstance(e.id)}
                title={e.verificationNote}
              >
                <span className="wb-thumb">
                  {e.photo ? (
                    // oxlint-disable-next-line next/no-img-element -- Static export: product photos ship as plain assets.
                    <img src={e.photo} alt="" loading="lazy" />
                  ) : (
                    <Box size={16} />
                  )}
                </span>
                <span className="wb-libtext">
                  <b>{e.name}</b>
                  <small>{e.variant}</small>
                  <span className="wb-flags">
                    {e.hasPhysicalModel ? (
                      <>
                        <i data-on={e.support.pinoutVerified || undefined}>
                          pinout
                        </i>
                        <i data-on={e.support.manualWiring || undefined}>
                          wiring
                        </i>
                        <i data-on={e.support.breadboardMount || undefined}>
                          seat
                        </i>
                        <i data-on={e.support.wokwiExport || undefined}>
                          simulation model
                        </i>
                      </>
                    ) : (
                      <i className="wb-nomodel">no physical model yet</i>
                    )}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* ---------------- bench ---------------- */}
        <main className="wb-stage">
          <div className="wb-hint">
            {hoverText ||
              `${workbench.instances.length} objects · ${workbench.wires.length} wires`}
          </div>
          {pinnedNet && (
            <button className="wb-netpin" onClick={() => setPinnedNet(null)}>
              Connection pinned · clear
            </button>
          )}
          {rewire && (
            <div className="wb-editnotice">
              Pick a new terminal for end {rewire.side.toUpperCase()} · Esc
              cancels
            </div>
          )}
          {mode === '2d' ? (
            <Bench2D
              showWires={showWires}
              activeEndpoint={hover ?? wireStart ?? probe}
              runtime={runtime}
              workbench={workbench}
              lookup={lookupModel}
              selection={selection}
              selectedWire={selectedWire}
              tool={tool}
              wireStart={wireStart}
              highlightNet={highlightNet}
              showLabels={showLabels}
              showGrid={showGrid}
              view={view}
              netOf={conn.netOf}
              onView={setView}
              onSelectInstance={selectInstance}
              onSelectWire={selectWire}
              onPickEndpoint={pickEndpoint}
              onHoverEndpoint={setHover}
              onMove={onMove}
              onFocus={focus}
              onEditWire={editWire}
              onRewire={(id, side) => {
                setRewire({ id, side });
                setTool('wire');
              }}
            />
          ) : (
            <ThreeBoundary onReturn={() => setMode('2d')}>
              <Suspense
                fallback={<div className="wb-loading">Loading 3D view…</div>}
              >
                <Bench3D
                  showWires={showWires}
                  activeEndpoint={hover ?? wireStart ?? probe}
                  cameraPose={cameraPose}
                  runtime={runtime}
                  workbench={workbench}
                  lookup={lookupModel}
                  selection={selection}
                  selectedWire={selectedWire}
                  highlightNet={highlightNet}
                  netOf={conn.netOf}
                  showLabels={showLabels}
                  active={active}
                  onSelectWire={selectWire}
                  onFocus={focus}
                  onEditWire={editWire}
                  onRewire={(id, side) => {
                    setRewire({ id, side });
                    setTool('wire');
                  }}
                  tool={tool}
                  wireStart={wireStart}
                  dark={dark}
                  apiRef={three}
                  onSelectInstance={selectInstance}
                  onPickEndpoint={pickEndpoint}
                  onHoverEndpoint={setHover}
                  onMove={onMove}
                />
              </Suspense>
            </ThreeBoundary>
          )}
          {repair && repair.before === workbench && (
            <div className="wb-repair">
              <b>Repair preview</b>
              <p>{repair.text}</p>
              <Button
                size="sm"
                onClick={() => {
                  apply('repair', () => repair.next);
                  setRepair(null);
                }}
              >
                Apply repair
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRepair(null)}>
                Cancel
              </Button>
            </div>
          )}
          {notice && (
            <output className="wb-notice">
              {notice}
              <button onClick={() => setNotice('')} aria-label="Dismiss">
                ×
              </button>
            </output>
          )}
        </main>

        {/* ---------------- properties ---------------- */}
        <aside className="wb-props">
          {selectedWire ? (
            (() => {
              const wire = workbench.wires.find((w) => w.id === selectedWire);
              if (!wire) return null;
              return (
                <>
                  <h3>Wire</h3>
                  <p className="wb-row">
                    {describeEndpoint(wire.a, workbench, lookupModel)}
                  </p>
                  <p className="wb-row">
                    → {describeEndpoint(wire.b, workbench, lookupModel)}
                  </p>
                  <div className="wb-colors">
                    {WIRE_COLORS.map((c) => (
                      <button
                        key={c.id}
                        style={{ background: c.id }}
                        data-on={wire.color === c.id || undefined}
                        title={c.name}
                        aria-label={c.name}
                        onClick={() =>
                          apply('wire-colour', (w) => ({
                            ...w,
                            wires: w.wires.map((x) =>
                              x.id === wire.id ? { ...x, color: c.id } : x,
                            ),
                          }))
                        }
                      />
                    ))}
                  </div>
                  <p className="wb-note">
                    Wire colour does not change electrical connectivity.
                  </p>
                  <div className="wb-tools">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRewire({ id: wire.id, side: 'a' });
                        setTool('wire');
                      }}
                    >
                      Reconnect A
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRewire({ id: wire.id, side: 'b' });
                        setTool('wire');
                      }}
                    >
                      Reconnect B
                    </Button>
                  </div>
                  <label className="wb-field">
                    Height (mm)
                    <input
                      type="range"
                      min="0"
                      max="80"
                      value={wire.lift ?? 18}
                      onChange={(e) =>
                        editWire(wire.id, { lift: Number(e.target.value) })
                      }
                    />
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const a = endpointPoint(wire.a, workbench, lookupModel),
                        b = endpointPoint(wire.b, workbench, lookupModel);
                      if (a && b)
                        editWire(wire.id, {
                          route: [
                            ...wire.route,
                            { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 10 },
                          ],
                        });
                    }}
                  >
                    Add bend
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => editWire(wire.id, { route: [] })}
                  >
                    Straighten
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPinnedNet(wire.a)}
                  >
                    Pin this connection
                  </Button>
                </>
              );
            })()
          ) : selected && selectedModel ? (
            <>
              <h3>{selected.name}</h3>
              <p className="wb-sub">{selectedModel.variant}</p>
              <dl className="wb-kv">
                <dt>Position</dt>
                <dd>
                  {selected.transform.x.toFixed(1)},{' '}
                  {selected.transform.y.toFixed(1)} mm ·{' '}
                  {selected.transform.rot}°
                </dd>
                <dt>Pins</dt>
                <dd>{selectedModel.pins.length || 'holes only'}</dd>
                <dt>Pinout</dt>
                <dd>{selectedModel.verification.pinout}</dd>
                <dt>Mechanical</dt>
                <dd>{selectedModel.verification.mechanical}</dd>
              </dl>
              {selectedModel.connectionGuide && (
                <div className="wb-accessory-guide">
                  <h4>Connection guide</h4>
                  <p>{selectedModel.connectionGuide}</p>
                  <p className="wb-note">
                    Wire here and use the supported simulation route. This
                    accessory{' '}
                    {LOCAL_MODELS.includes(selectedModel.id)
                      ? 'can run in this app with supported wiring.'
                      : 'uses Wokwi for code simulation.'}
                  </p>
                </div>
              )}
              {selectedModel.verification.note && (
                <p className="wb-note">{selectedModel.verification.note}</p>
              )}
              {selectedModel.kind !== 'breadboard' &&
                !selectedModel.accessoryVisual && (
                  <>
                    <Button size="sm" variant="ghost" onClick={trySeat}>
                      Seat on breadboard
                    </Button>
                    {headerCompatible(selectedModel) && (
                      <p className="wb-note">
                        {headerCompatible(selectedModel)!.ok
                          ? ''
                          : (
                              headerCompatible(selectedModel) as {
                                reason: string;
                              }
                            ).reason}
                      </p>
                    )}
                  </>
                )}
              {selected.value !== undefined && (
                <label className="wb-field">
                  Value ({selected.unit})
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={selected.value}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (value > 0 && Number.isFinite(value))
                        apply('value', (w) => ({
                          ...w,
                          instances: w.instances.map((i) =>
                            i.id === selected.id ? { ...i, value } : i,
                          ),
                        }));
                    }}
                  />
                </label>
              )}
              <h4>Connected pins</h4>
              <ul className="wb-pins">
                {selectedModel.pins
                  .filter((p) =>
                    workbench.wires.some(
                      (w) =>
                        (w.a.instanceId === selected.id &&
                          w.a.kind !== 'breadboard-hole' &&
                          w.a.pinId === p.id) ||
                        (w.b.instanceId === selected.id &&
                          w.b.kind !== 'breadboard-hole' &&
                          w.b.pinId === p.id),
                    ),
                  )
                  .map((p) => (
                    <li key={p.id}>
                      <b>{p.label}</b> <small>{p.group}</small>
                    </li>
                  ))}
                {!workbench.wires.some(
                  (w) =>
                    w.a.instanceId === selected.id ||
                    w.b.instanceId === selected.id,
                ) && <li className="wb-note">No wires yet.</li>}
              </ul>
              {selectedModel.sources.length > 0 && (
                <>
                  <h4>Sources</h4>
                  <ul className="wb-src">
                    {selectedModel.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.what}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className="wb-note">
              Select an object, or pick one from the library on the left.
            </p>
          )}

          <h4>Reference circuit</h4>
          <p className="wb-note">
            {workbench.target
              ? `${workbench.target.title} · ${targetIssues.length ? `${targetIssues.length} differences` : 'topology and values match'}`
              : 'No target selected. Load an example to compare connections.'}
          </p>
          <ul className="wb-issues">
            {targetIssues.slice(0, 20).map((i, k) => (
              <li key={k} data-sev={i.severity}>
                <button className="wb-issuebtn" onClick={() => locateIssue(i)}>
                  {i.text}
                </button>
                {['target-open', 'target-short', 'target-value'].includes(
                  i.code,
                ) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => previewRepair(i)}
                  >
                    Preview repair
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <h4>Fault practice</h4>
          <p className="wb-note">
            Find a removed jumper with the continuity probe. This measures a
            practice session, not a research result.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={
              !workbench.target ||
              !workbench.wires.length ||
              targetIssues.length > 0
            }
            onClick={() => {
              const f = injectFault(workbench);
              apply('practice', () => f.workbench);
              setExercise({ started: Date.now(), probes: 0, attempts: 0 });
              setTool('probe');
              setNotice(
                'A jumper has been removed. Probe terminals, restore the connection, then check your answer.',
              );
            }}
          >
            Start practice
          </Button>
          {exercise && (
            <>
              <p className="wb-note">
                {exercise.probes} probe readings · {exercise.attempts} checks
                {exercise.elapsed !== undefined
                  ? ` · solved in ${(exercise.elapsed / 1000).toFixed(1)} s`
                  : ''}
              </p>
              <Button
                size="sm"
                onClick={() => {
                  const solved =
                    compareTarget(workbench, lookupModel).length === 0;
                  setExercise((x) =>
                    x
                      ? {
                          ...x,
                          attempts: x.attempts + 1,
                          ...(solved && x.elapsed === undefined
                            ? { elapsed: Date.now() - x.started }
                            : {}),
                        }
                      : null,
                  );
                  setNotice(
                    solved
                      ? 'Reference connections restored.'
                      : 'The circuit still differs from its reference.',
                  );
                }}
              >
                Check answer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  saveFile(
                    'practice-session.json',
                    JSON.stringify(
                      {
                        project: workbench.title,
                        ...exercise,
                        recordedAt: new Date().toISOString(),
                        type: 'individual practice session',
                      },
                      null,
                      2,
                    ),
                    'application/json',
                  )
                }
              >
                Export session
              </Button>
            </>
          )}
          <h4>Connection checks</h4>
          {issues.length === 0 ? (
            <p className="wb-note">
              No metadata conflicts detected. Firmware execution and operating
              voltages have not been simulated.
            </p>
          ) : (
            <ul className="wb-issues">
              {issues.slice(0, 24).map((i, k) => (
                <li key={k} data-sev={i.severity}>
                  <button
                    type="button"
                    className="wb-issuebtn"
                    onClick={() => locateIssue(i)}
                  >
                    {i.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

export default Workbench;
export { endpointPoint };
