'use client';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Box,
  CheckCircle2,
  ChevronRight,
  Download,
  Lightbulb,
  Link2,
  Moon,
  MousePointer2,
  Printer,
  RotateCw,
  Sun,
  Trash2,
  Undo2,
  Upload,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { Board2D, type BoardActions } from './board-2d';
import { NetSchematic } from './schematic';
import { SallenKeySchematic } from './sallen-key-schematic';
import type { Board3DApi } from './board-3d';
const Board3D = lazy(() => import('./board-3d'));

import { downloadPng, guideHtml, svgPng } from './export';
import { EXAMPLES } from '@/lib/breadboard/circuits';
import {
  autoPlace,
  emptyLayout,
  validateLayout,
  parseCircuit,
  pinsOf,
  formatValue,
  pointOf,
  snapMove,
  rotatePart,
  assemblyList,
  endpointHole,
  HOLE_MAP,
  netColor,
  type Circuit,
  type Layout,
  type Wire,
  type Endpoint,
} from '@/lib/breadboard/model';
import { saveFile } from '@/lib/save-file';
type Hint = { message: string; apply: () => void };
export function BreadboardWorkspace({
  initialCircuit,
}: {
  initialCircuit: Circuit;
}) {
  const [circuit, setCircuit] = useState(initialCircuit),
    [example, setExample] = useState('sk-lp'),
    [layout, setLayout] = useState<Layout>(emptyLayout),
    [selected, setSelected] = useState<string | null>(null),
    [hovered, setHovered] = useState<string | null>(null),
    [highlight, setHighlight] = useState<string | null>(null),
    [armed, setArmed] = useState<string | null>(null),
    [wireStart, setWireStart] = useState<string | null>(null),
    [tool, setTool] = useState<'select' | 'wire'>('select'),
    [dark, setDark] = useState(false),
    [zoom, setZoom] = useState(100),
    [notice, setNotice] = useState(''),
    [hint, setHint] = useState<Hint | null>(null),
    [undoCount, setUndoCount] = useState(0),
    [mode, setMode] = useState<'2d' | '3d'>('2d');
  const threeRef = useRef<Board3DApi | null>(null);
  const [guide, setGuide] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null),
    history = useRef<Layout[]>([]),
    layoutRef = useRef(layout),
    file = useRef<HTMLInputElement>(null),
    wireId = useRef(1);
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  const automatic = useMemo(() => {
    try {
      return { layout: autoPlace(circuit), error: null };
    } catch (e) {
      return {
        layout: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [circuit]);
  const validation = useMemo(
    () => validateLayout(circuit, layout),
    [circuit, layout],
  );
  const commit = useCallback((next: Layout) => {
    history.current.push(structuredClone(layoutRef.current));
    if (history.current.length > 80) history.current.shift();
    setUndoCount(history.current.length);
    setLayout(next);
    setHint(null);
    setHighlight(null);
  }, []);
  const undo = useCallback(() => {
    const previous = history.current.pop();
    if (previous) {
      setLayout(previous);
      setUndoCount(history.current.length);
      setHint(null);
      setNotice('Last change undone.');
    }
  }, []);
  function remove() {
    if (!selected) return;
    const next = structuredClone(layout);
    if (next.parts[selected]) delete next.parts[selected];
    else next.wires = next.wires.filter((w) => w.id !== selected);
    commit(next);
    setSelected(null);
  }
  function rotate() {
    if (!selected || !layout.parts[selected]) return;
    const next = structuredClone(layout);
    next.parts[selected] = rotatePart(next.parts[selected]);
    commit(next);
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as Element)?.closest(
          'input,textarea,select,[contenteditable=true]',
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        rotate();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected) {
          e.preventDefault();
          remove();
        }
      } else if (e.key === 'Escape') {
        setArmed(null);
        setWireStart(null);
        setSelected(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  function choose(ref: string) {
    setSelected(ref);
    if (!layout.parts[ref] && circuit.components.some((c) => c.ref === ref)) {
      setArmed(ref);
      setTool('select');
      setNotice(ref + ': select a hole for pin 1.');
    }
  }
  function endpoint(hole: string): Endpoint {
    const h = HOLE_MAP.get(hole)!;
    for (const p of Object.values(layout.parts))
      for (const [pin, id] of Object.entries(p.pins)) {
        const other = HOLE_MAP.get(id);
        if (other?.group === h.group)
          return {
            hole,
            attach: { ref: p.ref, pin, dx: h.x - other.x, dy: h.y - other.y },
          };
      }
    return { hole };
  }
  const actions: BoardActions = {
    onPart: choose,
    onHover: setHovered,
    onNet: setHighlight,
    onMove: (ref, dx, dy) => {
      const next = structuredClone(layoutRef.current);
      next.parts[ref] = snapMove(next.parts[ref], dx, dy);
      commit(next);
    },
    onHole: (hole) => {
      if (armed && automatic.layout) {
        const p = automatic.layout.parts[armed],
          a = pointOf(p.pins['1']),
          b = pointOf(hole),
          next = structuredClone(layout);
        next.parts[armed] = snapMove(p, b.x - a.x, b.y - a.y);
        commit(next);
        setSelected(armed);
        setArmed(null);
        return;
      }
      if (tool === 'wire') {
        if (!wireStart) {
          setWireStart(hole);
          setNotice(hole + ' selected. Select the second hole.');
          return;
        }
        if (wireStart === hole) {
          setNotice('Select two different holes.');
          return;
        }
        const net =
          validation.terminals.find(
            (t) => t.actual === validation.holeToNet.get(wireStart),
          )?.expected ?? 'signal';
        const wire: Wire = {
          id: 'WM' + wireId.current++,
          a: endpoint(wireStart),
          b: endpoint(hole),
          color: netColor(net, circuit),
          net,
        };
        commit({ ...layout, wires: [...layout.wires, wire] });
        setWireStart(null);
        setSelected(wire.id);
        return;
      }
      setHighlight(validation.holeToNet.get(hole) ?? null);
      setNotice(
        hole +
          ' · ' +
          (validation.terminals
            .filter((t) => t.actual === validation.holeToNet.get(hole))
            .map((t) => t.ref + '.' + t.pin)
            .join(', ') || 'unconnected node'),
      );
    },
  };
  function nextHint() {
    const goal = automatic.layout;
    if (!goal) {
      setNotice(automatic.error ?? 'Could not generate the layout.');
      return;
    }
    if (validation.valid) {
      setNotice('Your circuit matches the target schematic.');
      setHint(null);
      return;
    }
    const parts = [...circuit.components].sort(
      (a, b) => Number(b.type === 'ic_dip8') - Number(a.type === 'ic_dip8'),
    );
    const missing =
      parts.find((p) => !layout.parts[p.ref]) ??
      parts.find(
        (p) =>
          JSON.stringify(layout.parts[p.ref].pins) !==
          JSON.stringify(goal.parts[p.ref].pins),
      );
    if (missing) {
      setHovered(missing.ref);
      setHint({
        message: `${missing.ref}: ${pinsOf(missing)
          .map(
            ([pin, n]) =>
              `${pin} → ${goal.parts[missing.ref].pins[pin]} (${n})`,
          )
          .join(' · ')}`,
        apply: () =>
          commit({
            ...layout,
            parts: {
              ...layout.parts,
              [missing.ref]: structuredClone(goal.parts[missing.ref]),
            },
          }),
      });
      return;
    }
    const extra = layout.wires.find(
      (w) => !goal.wires.some((g) => g.id === w.id),
    );
    if (extra) {
      setHint({
        message: `${extra.id}: remove the added jumper and check again.`,
        apply: () =>
          commit({
            ...layout,
            wires: layout.wires.filter((w) => w.id !== extra.id),
          }),
      });
      return;
    }
    const w = goal.wires.find((w) => !layout.wires.some((p) => p.id === w.id));
    if (w) {
      setHint({
        message: `Add jumper ${w.id} · ${w.net}: ${endpointHole(w.a, goal)} → ${endpointHole(w.b, goal)}.`,
        apply: () =>
          commit({ ...layout, wires: [...layout.wires, structuredClone(w)] }),
      });
      return;
    }
    setNotice(
      'The layout has changed. Correct the pin shown in the error list or restore the automatic layout.',
    );
  }
  function loadCircuit(c: Circuit, id = 'custom') {
    setCircuit(c);
    setExample(id);
    setLayout(emptyLayout());
    setSelected(null);
    setArmed(null);
    setWireStart(null);
    setHint(null);
    history.current = [];
    setUndoCount(0);
  }
  async function png() {
    if (!svgRef.current) return;
    try {
      if (mode === '3d') {
        if (!threeRef.current) throw Error('The 3D image is not ready yet.');
        downloadPng(threeRef.current.png(), 'circuit-forge-breadboard-3d.png');
      } else
        downloadPng(
          await svgPng(svgRef.current),
          'circuit-forge-breadboard-2d.png',
        );
    } catch (e) {
      setNotice(String(e));
    }
  }
  async function printGuide() {
    if (!svgRef.current) return;
    try {
      setGuide(guideHtml(circuit, layout, await svgPng(svgRef.current)));
    } catch (e) {
      setNotice(String(e));
    }
  }
  const part = circuit.components.find((c) => c.ref === selected),
    wire = layout.wires.find((w) => w.id === selected),
    placed = Object.keys(layout.parts).length;
  return (
    <main className={'bb-workspace ' + (dark ? 'bb-dark' : '')}>
      <div className="bb-title-row">
        <div>
          <div className="eyebrow">PHYSICAL CONNECTIONS / 830 HOLES</div>
          <h1>From schematic to breadboard.</h1>
        </div>
        <Button
          variant="outline"
          onClick={() => setDark(!dark)}
          aria-label={dark ? 'Light theme' : 'Dark theme'}
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </Button>
      </div>
      <div className="bb-toolbar">
        <Select
          value={example}
          onValueChange={(v) => {
            const e = EXAMPLES.find((e) => e.id === v);
            if (e) loadCircuit(e.circuit, e.id);
          }}
          items={Object.fromEntries([
            ...EXAMPLES.map((e) => [e.id, e.name]),
            ['custom', 'Imported circuit'],
          ])}
        >
          <SelectTrigger aria-label={'Breadboard circuit'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXAMPLES.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
            {example === 'custom' && (
              <SelectItem value="custom">Imported circuit</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Button
          onClick={() => {
            if (automatic.layout) commit(structuredClone(automatic.layout));
          }}
          disabled={!automatic.layout}
        >
          <WandSparkles size={16} />
          Auto-build
        </Button>
        <Button variant="outline" onClick={() => commit(emptyLayout())}>
          Empty board
        </Button>
        <Button variant="outline" onClick={nextHint}>
          <Lightbulb size={16} />
          Hint
        </Button>
        <Button variant="ghost" disabled={!undoCount} onClick={undo}>
          <Undo2 size={16} />
          Undo
        </Button>
        <Button variant="ghost" onClick={() => file.current?.click()}>
          <Upload size={16} />
          Import JSON
        </Button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              if (f.size > 100000)
                throw Error('The JSON file must be no larger than 100 KB.');
              loadCircuit(parseCircuit(JSON.parse(await f.text())));
              setNotice('Circuit imported; components are in the tray.');
            } catch (error) {
              setNotice(error instanceof Error ? error.message : String(error));
            }
            e.target.value = '';
          }}
        />
      </div>
      {automatic.error && (
        <p className="bb-error" role="alert">
          {automatic.error}
        </p>
      )}
      <div className="bb-grid">
        <div className="bb-main-column">
          <section className="bb-surface">
            <div className="bb-surface-bar">
              <div className="bb-view-toggle">
                <Button
                  size="sm"
                  variant={mode === '2d' ? 'default' : 'ghost'}
                  onClick={() => {
                    setMode('2d');
                    setNotice('');
                  }}
                >
                  2D top view
                </Button>
                <Button
                  size="sm"
                  variant={mode === '3d' ? 'default' : 'ghost'}
                  onClick={() => {
                    setMode('3d');
                    setNotice(
                      "Drag empty space to rotate; scroll to zoom. Drag a component's body to move it.",
                    );
                  }}
                >
                  <Box size={15} />
                  3D
                </Button>
              </div>
              <div className="bb-edit-tools">
                <Button
                  size="icon"
                  variant={tool === 'select' ? 'secondary' : 'ghost'}
                  aria-label={'Select and move components'}
                  onClick={() => {
                    setTool('select');
                    setWireStart(null);
                  }}
                >
                  <MousePointer2 size={16} />
                </Button>
                <Button
                  size="icon"
                  variant={tool === 'wire' ? 'secondary' : 'ghost'}
                  aria-label={'Draw jumper'}
                  onClick={() => {
                    setTool('wire');
                    setArmed(null);
                    setWireStart(null);
                    setNotice('Select two empty holes for the wire.');
                  }}
                >
                  <Link2 size={16} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={!part || !layout.parts[part.ref]}
                  aria-label={'Rotate the selected component 90 degrees'}
                  onClick={rotate}
                >
                  <RotateCw size={16} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={!selected}
                  aria-label={'Delete selection'}
                  onClick={remove}
                >
                  <Trash2 size={16} />
                </Button>
                <span className="bb-tool-divider" />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={'Zoom out'}
                  onClick={() =>
                    mode === '3d'
                      ? threeRef.current?.zoom(1.2)
                      : setZoom((v) => Math.max(60, v - 20))
                  }
                >
                  <ZoomOut size={16} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={'Zoom in'}
                  onClick={() =>
                    mode === '3d'
                      ? threeRef.current?.zoom(0.84)
                      : setZoom((v) => Math.min(240, v + 20))
                  }
                >
                  <ZoomIn size={16} />
                </Button>
              </div>
            </div>
            <div className="bb-instruction">
              {armed
                ? `${armed} selected. Select a hole for its first pin.`
                : tool === 'wire'
                  ? wireStart
                    ? `${wireStart} → select the second hole.`
                    : 'Select two empty holes to draw a jumper.'
                  : 'Choose a component from the tray and place it on the board. Drag to move · R to rotate · Delete to remove.'}
            </div>
            {mode === '3d' && (
              <Suspense
                fallback={
                  <div className="bb-3d bb-3d-error">Loading 3D view…</div>
                }
              >
                <Board3D
                  circuit={circuit}
                  layout={layout}
                  selected={selected}
                  hovered={hovered}
                  highlight={highlight}
                  graph={validation.holeToNet}
                  actions={actions}
                  apiRef={threeRef}
                  drawing={tool === 'wire' || !!armed}
                />
              </Suspense>
            )}
            <div style={{ display: mode === '2d' ? 'block' : 'none' }}>
              <Board2D
                circuit={circuit}
                layout={layout}
                selected={selected}
                hovered={hovered}
                highlight={highlight}
                graph={validation.holeToNet}
                actions={actions}
                zoom={zoom}
                svgRef={svgRef}
              />
            </div>
            <div className="bb-board-footer">
              <span>
                <i />
                2.54 mm grid · 7.62 mm gap between E/F
              </span>
              <span>Power rails are split in the middle</span>
              <strong>
                {placed}/{circuit.components.length} parts
              </strong>
            </div>
          </section>
          <section className="bb-surface bb-schema">
            <div className="bb-panel-heading">
              <h2>Target circuit</h2>
              <span>{circuit.title}</span>
            </div>
            {example === 'sk-lp' ? (
              <SallenKeySchematic
                parts={{
                  r1: circuit.components.find((c) => c.ref === 'R1')!.value!,
                  r2: circuit.components.find((c) => c.ref === 'R2')!.value!,
                  c1: circuit.components.find((c) => c.ref === 'C1')!.value!,
                  c2: circuit.components.find((c) => c.ref === 'C2')!.value!,
                }}
                physical
                hovered={hovered ?? selected}
                onHover={setHovered}
                onSelect={choose}
              />
            ) : (
              <NetSchematic
                circuit={circuit}
                hovered={hovered ?? selected}
                onHover={setHovered}
                onSelect={choose}
              />
            )}
            <p>
              Identical node labels indicate the same electrical connection.
              Hover over a component in the schematic or on the board.
            </p>
          </section>
          <div className="bb-export-row">
            <Button variant="outline" onClick={png}>
              <Download size={16} />
              PNG
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                saveFile(
                  'breadboard-kurulum.txt',
                  assemblyList(circuit, layout),
                )
              }
            >
              <Download size={16} />
              Assembly list
            </Button>
            <Button variant="outline" onClick={printGuide}>
              <Printer size={16} />
              One-page guide
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                saveFile(
                  'breadboard-netlist.json',
                  JSON.stringify(
                    {
                      circuit,
                      layout,
                      extractedNetlist: validation.netlist,
                      issues: validation.issues,
                    },
                    null,
                    2,
                  ),
                  'application/json',
                )
              }
            >
              Netlist and layout JSON
            </Button>
          </div>
        </div>
        <aside className="bb-side-column">
          <section className="bb-surface bb-tray">
            <div className="bb-panel-heading">
              <h2>Component tray</h2>
              <span>{circuit.components.length} parts</span>
            </div>
            {circuit.components.map((c) => (
              <button
                key={c.ref}
                className={
                  'bb-tray-part ' + (selected === c.ref ? 'active' : '')
                }
                onClick={() => choose(c.ref)}
                onPointerEnter={() => setHovered(c.ref)}
                onPointerLeave={() => setHovered(null)}
              >
                <span className={'bb-tray-symbol ' + c.type}>
                  {c.type === 'ic_dip8'
                    ? 'IC'
                    : c.type === 'resistor'
                      ? 'R'
                      : c.type === 'inductor'
                        ? 'L'
                        : c.type === 'wire'
                          ? 'W'
                          : 'C'}
                </span>
                <span>
                  <b>{c.ref}</b>
                  <small>{formatValue(c)}</small>
                </span>
                {layout.parts[c.ref] ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <ChevronRight size={17} />
                )}
              </button>
            ))}
          </section>
          {(part || wire) && (
            <section className="bb-surface bb-inspector">
              <div className="bb-panel-heading">
                <h2>{selected}</h2>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={'Clear selection'}
                  onClick={() => {
                    setSelected(null);
                    setArmed(null);
                  }}
                >
                  <X size={15} />
                </Button>
              </div>
              {part ? (
                <>
                  <strong>{formatValue(part)}</strong>
                  {part.tolerance !== undefined && (
                    <p>Tolerance ±{part.tolerance * 100}%</p>
                  )}
                  {part.type === 'capacitor_electrolytic' && (
                    <p>1: long (+) lead · 2: striped (−) lead.</p>
                  )}
                  <dl>
                    {pinsOf(part).map(([pin, net]) => (
                      <div key={pin}>
                        <dt>
                          Pin {pin} · {net}
                        </dt>
                        <dd>
                          {layout.parts[part.ref]?.pins[pin] ?? 'In tray'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                wire && (
                  <p>
                    {endpointHole(wire.a, layout)} →{' '}
                    {endpointHole(wire.b, layout)}
                    <br />
                    {wire.net ?? 'Manually added jumper'}
                  </p>
                )
              )}
            </section>
          )}
          {hint && (
            <section className="bb-hint">
              <Lightbulb size={20} />
              <h3>Next step</h3>
              <p>{hint.message}</p>
              <Button onClick={hint.apply}>
                Apply this step <ChevronRight size={15} />
              </Button>
            </section>
          )}
          <section
            className={
              'bb-surface bb-validation ' + (validation.valid ? 'valid' : '')
            }
            aria-live="polite"
          >
            <div className="bb-panel-heading">
              <h2>
                {validation.valid
                  ? 'Correct — matches the schematic'
                  : 'Connectivity check'}
              </h2>
              {validation.valid && <CheckCircle2 size={20} />}
            </div>
            <p>
              {validation.valid
                ? 'The circuit reconstructed from the holes matches the target component-pin connections.'
                : `${validation.issues.length} findings · recalculated after every change.`}
            </p>
            <ol>
              {validation.issues.slice(0, 14).map((issue, i) => (
                <li key={i}>
                  <button
                    onClick={() => {
                      if (circuit.components.some((c) => c.ref === issue.ref)) {
                        setSelected(issue.ref);
                        setHovered(issue.ref);
                      }
                    }}
                  >
                    <b>
                      {issue.ref}.{issue.pin}
                    </b>
                    <span>
                      {issue.message.replace(
                        issue.ref + '.' + issue.pin + ': ',
                        '',
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {validation.issues.length > 14 && (
              <details>
                <summary>
                  Remaining {validation.issues.length - 14} findings
                </summary>
                {validation.issues.slice(14).map((issue, i) => (
                  <p key={i}>{issue.message}</p>
                ))}
              </details>
            )}
            {validation.warnings.map((w) => (
              <p className="bb-caution" key={w}>
                {w}
              </p>
            ))}
          </section>
        </aside>
      </div>
      <output className="bb-notice" aria-live="polite">
        {notice}
      </output>
      <Dialog
        open={guide !== null}
        onOpenChange={(open) => {
          if (!open) setGuide(null);
        }}
      >
        <DialogContent className="bb-guide-dialog">
          <DialogTitle>Assembly guide</DialogTitle>
          <DialogDescription>
            A4 landscape · board view and numbered connections. Use the
            guide&apos;s button to print or save as PDF.
          </DialogDescription>
          {guide && (
            <iframe
              title={'Breadboard print preview'}
              srcDoc={guide}
              sandbox="allow-scripts allow-modals"
            />
          )}
          <Button
            variant="outline"
            onClick={() =>
              guide && saveFile('breadboard-kilavuz.html', guide, 'text/html')
            }
          >
            Download guide as HTML
          </Button>
        </DialogContent>
      </Dialog>
      <p className="bb-scope">
        This view validates physical connections. Frequency response, supply
        bypassing, op-amp limits, and real-board parasitics require separate
        evaluation. Download your changes before leaving.
      </p>
    </main>
  );
}
