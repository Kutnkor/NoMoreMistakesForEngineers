'use client';
/* oxlint-disable next/no-html-link-for-pages -- This static export uses native page navigation, including disposal of page-scoped workers. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircuitBoard,
  Code2,
  Copy,
  Cpu,
  ExternalLink,
  FlaskConical,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { boards, components, catalogDate } from '@/lib/hardware/catalog';
import { planHardware } from '@/lib/hardware/planner';
import { generateSketch, wiringMarkdown } from '@/lib/hardware/sketch';
import type {
  Component,
  Selection,
  FilterTransfer,
} from '@/lib/hardware/types';
import { WiringDiagram } from '@/components/studio/wiring-diagram';
import { SerialMonitor } from '@/components/studio/serial-monitor';
import { SimulationExport } from '@/components/studio/simulation-export';
import './studio.css';
import './lab/lab.css';
import { ProductPhoto, PhotoCredit } from '@/components/studio/product-photo';
const ready = (c: Component) => !!c.template && c.template !== 'passive';
const label = (c: Component) =>
  ready(c)
    ? 'Code + pins'
    : c.template === 'passive'
      ? 'Parts list'
      : 'Catalog';
const presets = [
  {
    name: 'Virtual control panel',
    description: 'Pot · LED · button · OLED / Wokwi',
    parts: ['led-red', 'pot-10k', 'pushbutton', 'ssd1306-adafruit-128x64'],
  },
  {
    name: 'Starter circuit',
    description: 'LED · potentiometer · button',
    parts: ['led-red', 'pot-10k', 'pushbutton'],
  },
  {
    name: 'Weather station',
    description: 'BME280 · OLED display',
    parts: ['bme280-adafruit', 'ssd1306-adafruit-128x64'],
  },
  {
    name: 'Distance measurement',
    description: 'HC-SR04 · status LED',
    parts: ['hcsr04-5v-sparkfun', 'led-red'],
  },
  {
    name: 'Filter readout',
    description: 'Sallen–Key · ADC',
    parts: ['filter-output'],
  },
];
function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function hex(n: number) {
  return '0x' + n.toString(16).toUpperCase();
}
export default function ArduinoStudio() {
  const [boardId, setBoardId] = useState('uno-rev3'),
    [selected, setSelected] = useState<Selection[]>([
      { id: 'm1', componentId: 'led-red' },
      { id: 'm2', componentId: 'pot-10k' },
      { id: 'm3', componentId: 'pushbutton' },
    ]);
  const [view, setView] = useState('studio'),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState('All'),
    [boardSearch, setBoardSearch] = useState(''),
    [boardFamily, setBoardFamily] = useState('All'),
    [copied, setCopied] = useState(false),
    [notice, setNotice] = useState(''),
    [filter, setFilter] = useState<FilterTransfer | null>(null),
    [outputTab, setOutputTab] = useState('wiring');
  const nextId = useRef(4);
  /* oxlint-disable react/react-compiler -- Import the browser URL after hydration so initial markup matches the static export. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('mode') !== 'filter') return;
    const keys = ['r1', 'r2', 'c1', 'c2', 'passHz', 'stopHz'] as const;
    const v = Object.fromEntries(
      keys.map((k) => [k, Number(p.get(k))]),
    ) as FilterTransfer;
    if (
      keys.every((k) => Number.isFinite(v[k]) && v[k] > 0) &&
      v.r1 <= 1e7 &&
      v.r2 <= 1e7 &&
      v.c1 < 1 &&
      v.c2 < 1
    ) {
      setFilter(v);
      setSelected([{ id: 'm1', componentId: 'filter-output' }]);
      setNotice(
        'Your filter design has been added to the Arduino measurement plan.',
      );
    }
  }, []);
  /* oxlint-enable react/react-compiler */
  const board = boards.find((b) => b.id === boardId)!;
  const plan = useMemo(
    () => planHardware(board, components, selected),
    [board, selected],
  );
  const code = useMemo(
    () => (plan.canGenerate ? generateSketch(plan, filter) : ''),
    [plan, filter],
  );
  const errors = plan.issues.filter((i) => i.severity === 'error'),
    warnings = plan.issues.filter((i) => i.severity === 'warning');
  const categories = ['All', ...new Set(components.map((c) => c.category))],
    families = ['All', ...new Set(boards.map((b) => b.family))];
  const visibleParts = components.filter(
    (c) =>
      (category === 'All' || c.category === category) &&
      (c.name + ' ' + c.description + ' ' + c.interface)
        .toLocaleLowerCase('en')
        .includes(search.toLocaleLowerCase('en')),
  );
  const visibleBoards = boards.filter(
    (b) =>
      (boardFamily === 'All' || b.family === boardFamily) &&
      (b.name + ' ' + b.mcu).toLowerCase().includes(boardSearch.toLowerCase()),
  );
  function add(c: Component) {
    if (selected.length >= 8) {
      setNotice('This plan has reached its limit of 8 modules.');
      return;
    }
    setSelected((s) => [
      ...s,
      { id: 'm' + nextId.current++, componentId: c.id },
    ]);
    setNotice(c.name + ' added.');
  }
  function preset(index: number) {
    const selections = presets[index].parts.map((componentId) => ({
      id: 'm' + nextId.current++,
      componentId,
    }));
    setSelected(selections);
    if (!planHardware(board, components, selections).canGenerate)
      setBoardId('uno-rev3');
    setOutputTab(index === 0 ? 'simulation' : 'wiring');
    setFilter(null);
    setNotice(presets[index].name + ' ready.');
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice(
        'Clipboard access is unavailable in this browser. You can download the .ino file instead.',
      );
    }
  }
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const catalogCard = (c: Component) => (
    <article className="part-card" key={c.id}>
      <ProductPhoto
        id={c.id}
        name={c.name}
        className="catalog-part-photo"
        inspect
      />
      <div className="part-card-body">
        <div className="part-card-title">
          <h3>{c.name}</h3>
          <span className={'support-chip ' + (ready(c) ? 'supported' : '')}>
            {label(c)}
          </span>
        </div>
        <p>{c.description}</p>
        <div className="part-meta">
          <span>{c.interface}</span>
          <span>
            {c.supplyRange
              ? `${c.supplyRange[0]}–${c.supplyRange[1]} V`
              : 'Component-dependent'}
          </span>
          {c.addresses[0] !== undefined && <span>{hex(c.addresses[0])}</span>}
        </div>
        <details>
          <summary>Electrical profile and source</summary>
          <PhotoCredit id={c.id} />
          <ul>
            {c.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          {c.requires.length > 0 && (
            <p>Additional parts: {c.requires.join(' · ')}</p>
          )}
          <a href={c.sourceUrl} target="_blank" rel="noreferrer">
            Manufacturer / official documentation <ExternalLink size={11} />
          </a>
        </details>
      </div>
      <Button
        className="add-part"
        size="icon"
        variant="outline"
        disabled={selected.length >= 8}
        onClick={() => add(c)}
        aria-label={c.name + ' add'}
      >
        <Plus size={16} />
      </Button>
    </article>
  );
  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <a className="studio-brand" href="/">
          <span className="brand-mark">
            <CircuitBoard size={23} />
          </span>
          <div>
            CIRCUIT<span>FORGE</span>
            <small>EMBEDDED DESIGN STUDIO</small>
          </div>
        </a>
        <nav>
          <span className="nav-active">Hardware Studio</span>
          <a href="/lab">AI Laboratory</a>
          <a href="/breadboard">Breadboard</a>
          <a href="/filter">
            <FlaskConical size={14} /> Filter AI <ArrowRight size={13} />
          </a>
        </nav>
        <div className="version-tag">
          <i /> Personal workspace
        </div>
      </header>
      <main className="studio-main">
        <div className="studio-heading">
          <div>
            <div className="eyebrow">
              <span /> YOUR WORKSPACE
            </div>
            <h1>Design your circuit.</h1>
            <p>Choose your board and components to plan their connections.</p>
          </div>
          <a className="filter-link" href="/lab">
            <span>
              <FlaskConical size={19} />
            </span>
            <div>
              Next step
              <strong>
                Open the AI laboratory <ArrowRight size={14} />
              </strong>
            </div>
          </a>
        </div>
        <div className="coverage-strip">
          <div>
            <Cpu size={16} />
            <b>{boards.length}</b> boards
          </div>
          <div>
            <Layers3 size={16} />
            <b>{components.length - 1}</b> components
          </div>
          <div>
            <Code2 size={16} />
            <b>{boards.filter((b) => b.profile).length}</b> boards with code
            support
          </div>
          <div>
            <ShieldCheck size={16} />
            <b>{components.filter(ready).length}</b> modules with code support
          </div>
          <span>Sources checked · {catalogDate}</span>
        </div>
        <Tabs
          value={view}
          onValueChange={(v) => setView(String(v))}
          className="workspace-tabs"
        >
          <div className="workspace-nav">
            <TabsList variant="line">
              <TabsTrigger value="studio">
                <SlidersHorizontal size={15} />
                Design workspace
              </TabsTrigger>
              <TabsTrigger value="boards">
                <Cpu size={15} />
                Board catalog <em>{boards.length}</em>
              </TabsTrigger>
              <TabsTrigger value="parts">
                <Layers3 size={15} />
                Components <em>{components.length - 1}</em>
              </TabsTrigger>
            </TabsList>
            <span className="workspace-note">
              All calculations run in this browser
            </span>
          </div>
          <TabsContent value="studio">
            <div className="studio-grid">
              <aside className="setup-column">
                <section className="studio-panel board-panel">
                  <div className="panel-heading">
                    <span className="step-num">01</span>
                    <h2>Controller board</h2>
                    <button onClick={() => setView('boards')}>
                      All boards <ChevronRight size={13} />
                    </button>
                  </div>
                  <Select
                    value={boardId}
                    onValueChange={(v) => v && setBoardId(v)}
                  >
                    <SelectTrigger
                      className="board-select"
                      aria-label={'Controller board'}
                    >
                      <SelectValue>{board.name}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {boards.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                          {b.profile ? ' · Code + pins' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ProductPhoto
                    id={board.id}
                    name={board.name}
                    className="selected-board-photo"
                    eager
                    inspect
                  />
                  <div className="board-specs">
                    <div>
                      <small>LOGIC</small>
                      <strong>
                        {board.logicVoltage ?? '—'}
                        <span> V</span>
                      </strong>
                    </div>
                    <div>
                      <small>ANALOG</small>
                      <strong>
                        {board.analogInputs ?? '—'}
                        <span> inputs</span>
                      </strong>
                    </div>
                    <div>
                      <small>PROFILE</small>
                      <strong className={board.profile ? 'lime-text' : ''}>
                        {board.profile ? 'Ready' : 'Catalog'}
                      </strong>
                    </div>
                  </div>
                  <a
                    href={board.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="source-link"
                  >
                    {board.mcu} <ExternalLink size={12} />
                  </a>
                </section>
                <section className="studio-panel selected-panel">
                  <div className="panel-heading">
                    <span className="step-num">02</span>
                    <h2>Circuit modules</h2>
                    <span className="mono-count">{selected.length}/8</span>
                  </div>
                  <div className="selected-list">
                    {plan.items.map((item) => (
                      <div className="selected-item" key={item.selection.id}>
                        <ProductPhoto
                          id={item.component.id}
                          name={item.component.name}
                          className="selected-module-photo"
                        />
                        <div>
                          <strong>{item.component.name}</strong>
                          <small>
                            {label(item.component)} · {item.selection.id}
                          </small>
                          {item.component.addresses.length > 1 && (
                            <Select
                              value={String(
                                item.selection.address ??
                                  item.component.addresses[0],
                              )}
                              onValueChange={(v) =>
                                v &&
                                setSelected((s) =>
                                  s.map((x) =>
                                    x.id === item.selection.id
                                      ? { ...x, address: Number(v) }
                                      : x,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger
                                size="sm"
                                aria-label={
                                  item.component.name + ' I2C address'
                                }
                                className="address-select"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {item.component.addresses.map((a) => (
                                  <SelectItem key={a} value={String(a)}>
                                    {hex(a)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <button
                          aria-label={item.component.name + ' remove'}
                          onClick={() =>
                            setSelected((s) =>
                              s.filter((x) => x.id !== item.selection.id),
                            )
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {!selected.length && (
                      <p className="empty-copy">Add a component below.</p>
                    )}
                  </div>
                </section>
                <section className="studio-panel library-panel">
                  <div className="panel-heading">
                    <span className="step-num">03</span>
                    <h2>Add a component</h2>
                  </div>
                  <label className="search-field">
                    <Search size={15} />
                    <input
                      aria-label={'Search components'}
                      placeholder={'Sensor, LED, display…'}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <Select
                    value={category}
                    onValueChange={(v) => v && setCategory(v)}
                  >
                    <SelectTrigger
                      className="category-select"
                      aria-label={'Component category'}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem value={c} key={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="compact-library">
                    {visibleParts.map((c) => (
                      <div key={c.id}>
                        <ProductPhoto
                          id={c.id}
                          name={c.name}
                          className="library-photo"
                        />
                        <span>
                          <strong>{c.name}</strong>
                          <small>
                            {c.interface} · {label(c)}
                          </small>
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={selected.length >= 8}
                          onClick={() => add(c)}
                          aria-label={c.name + ' add'}
                        >
                          <Plus size={16} />
                        </Button>
                      </div>
                    ))}
                    {!visibleParts.length && (
                      <p className="empty-copy">
                        No components match your search.
                      </p>
                    )}
                  </div>
                </section>
              </aside>
              <div className="design-column">
                <section className="preset-row">
                  {presets.map((p, i) => (
                    <button onClick={() => preset(i)} key={p.name}>
                      <ProductPhoto
                        id={p.parts[0]}
                        name={p.name}
                        className="preset-photo"
                      />
                      <div>
                        <strong>{p.name}</strong>
                        <small>{p.description}</small>
                      </div>
                      <ArrowRight size={14} />
                    </button>
                  ))}
                </section>
                <section className="studio-panel design-panel">
                  <div className="design-title">
                    <div>
                      <span className="eyebrow">WIRING WORKSPACE</span>
                      <h2>
                        {board.name.replace('Arduino ', '')}{' '}
                        <span>+ {selected.length} modules</span>
                      </h2>
                    </div>
                    <span
                      className={
                        'plan-state ' + (plan.canGenerate ? 'ok' : 'review')
                      }
                    >
                      {plan.canGenerate ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <TriangleAlert size={14} />
                      )}{' '}
                      {plan.canGenerate
                        ? 'Ready to generate code'
                        : errors.length
                          ? `${errors.length} issues to resolve`
                          : 'Add a module to start'}
                    </span>
                  </div>
                  <WiringDiagram plan={plan} />
                  <div className="diagram-footer">
                    <span>
                      <i className="lime-dot" /> Signal connections
                    </span>
                    <span>Lines show pin assignments</span>
                    <strong>{plan.usedPins.length} pins assigned</strong>
                  </div>
                </section>
                <section className="studio-panel output-panel">
                  <Tabs
                    value={outputTab}
                    onValueChange={(v) => setOutputTab(String(v))}
                  >
                    <div className="output-heading">
                      <TabsList variant="line">
                        <TabsTrigger value="wiring">Connections</TabsTrigger>
                        <TabsTrigger value="code">Arduino code</TabsTrigger>
                        <TabsTrigger value="simulation">Simulation</TabsTrigger>
                        <TabsTrigger value="serial">Serial monitor</TabsTrigger>
                        <TabsTrigger value="bom">Parts list</TabsTrigger>
                      </TabsList>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!plan.items.length}
                        onClick={() =>
                          download(
                            'circuit-forge-plan.md',
                            wiringMarkdown(plan, filter),
                          )
                        }
                      >
                        <ArrowDownToLine size={14} />
                        <span>Download plan</span>
                      </Button>
                    </div>
                    <TabsContent value="wiring">
                      <div className="table-scroll">
                        <table className="wiring-table">
                          <thead>
                            <tr>
                              <th>MODULE</th>
                              <th>SIGNAL</th>
                              <th>BOARD PIN / BUS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plan.wires.map((w, i) => (
                              <tr key={i}>
                                <td>
                                  {
                                    plan.items.find(
                                      (x) => x.selection.id === w.itemId,
                                    )?.component.name
                                  }
                                  <small>{w.itemId}</small>
                                </td>
                                <td>{w.signal}</td>
                                <td>
                                  <code className={'pin-badge ' + w.role}>
                                    {w.boardPin}
                                  </code>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!plan.wires.length && (
                          <p className="empty-copy">
                            Select a board and module with code support to
                            create a pin plan.
                          </p>
                        )}
                      </div>
                      <p className="micro-copy">
                        Resistor and sensor wiring details are in the checks and
                        parts list below. Match the labels to the pins on your
                        board.
                      </p>
                    </TabsContent>
                    <TabsContent value="code">
                      <div className="code-toolbar">
                        <span>
                          CircuitForge.ino <small> C++ / Arduino</small>
                        </span>
                        <div className="action-row">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!code}
                            onClick={() => void copy()}
                          >
                            {copied ? <Check size={14} /> : <Copy size={14} />}{' '}
                            {copied ? 'Copied' : 'Copy'}
                          </Button>
                          <Button
                            size="sm"
                            disabled={!code}
                            onClick={() => download('CircuitForge.ino', code)}
                          >
                            <ArrowDownToLine size={14} /> Download .ino
                          </Button>
                        </div>
                      </div>
                      {code ? (
                        <pre className="arduino-code">{code}</pre>
                      ) : (
                        <div className="code-empty">
                          <Code2 size={28} />
                          <h3>Complete the plan to generate code.</h3>
                          <p>
                            Resolve the errors in the checks. Automatic code
                            generation is not yet available for catalog-only
                            parts.
                          </p>
                        </div>
                      )}
                      <div className="ide-steps">
                        <b>Run in Arduino IDE</b>
                        <p>
                          1. Install the board package and select your board. 2.{' '}
                          {plan.libraries.length
                            ? `Install the libraries: ${plan.libraries.join(', ')}.`
                            : 'No additional libraries are required.'}{' '}
                          3. Open CircuitForge.ino in a folder with the same
                          name; select Verify → Upload. 4. Open the serial
                          monitor at 115200 baud.
                        </p>
                        <small>
                          This specific combination has not been tested on
                          hardware. The project report records the scope of
                          validation separately.
                        </small>
                      </div>
                    </TabsContent>
                    <TabsContent value="serial">
                      <SerialMonitor />
                    </TabsContent>
                    <TabsContent value="simulation">
                      <SimulationExport plan={plan} />
                    </TabsContent>
                    <TabsContent value="bom">
                      <div className="bom-list">
                        {plan.items.map((i) => (
                          <article key={i.selection.id}>
                            <ProductPhoto
                              id={i.component.id}
                              name={i.component.name}
                              className="bom-photo"
                              inspect
                            />
                            <div>
                              <strong>{i.component.name}</strong>
                              <a
                                href={i.component.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink size={13} />
                                Source
                              </a>
                            </div>
                            <p>
                              {i.component.requires.length
                                ? 'Additional parts required: ' +
                                  i.component.requires.join(' · ')
                                : "Check the manufacturer's wiring diagram for additional parts."}
                            </p>
                            <ul>
                              {i.component.notes.map((n, k) => (
                                <li key={k}>{n}</li>
                              ))}
                            </ul>
                          </article>
                        ))}
                        {filter && <pre>{JSON.stringify(filter, null, 2)}</pre>}
                      </div>
                    </TabsContent>
                  </Tabs>
                </section>
                <section className="studio-panel checks-panel">
                  <div className="panel-heading">
                    <ShieldCheck size={18} />
                    <h2>Checks and notes</h2>
                    <span className="mono-count">
                      {errors.length} errors · {warnings.length} warnings
                    </span>
                  </div>
                  <div className="check-list">
                    {plan.issues.map((issue, i) => (
                      <div className={'check-item ' + issue.severity} key={i}>
                        {issue.severity === 'error' ? (
                          <TriangleAlert size={16} />
                        ) : issue.severity === 'warning' ? (
                          <Zap size={16} />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}
                        <p>{issue.text}</p>
                      </div>
                    ))}
                    {!plan.issues.length && (
                      <p className="micro-copy">
                        No pin or address conflicts were found for the selected
                        templates.
                      </p>
                    )}
                  </div>
                  <p className="micro-copy">
                    Pin and address checks do not replace hardware validation of
                    power budgets, timers, or signal quality. Changing an
                    address also requires changing the corresponding physical
                    jumper.
                  </p>
                </section>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="boards">
            <section className="catalog-intro">
              <div>
                <h2>Choose a board. See what it supports.</h2>
                <p>
                  Current and legacy boards share one catalog. Boards without a
                  “Code + pins” profile display researched specifications.
                </p>
              </div>
              <label className="search-field">
                <Search size={16} />
                <input
                  value={boardSearch}
                  onChange={(e) => setBoardSearch(e.target.value)}
                  aria-label={'Search boards'}
                  placeholder="UNO, Nano, Portenta…"
                />
              </label>
              <Select
                value={boardFamily}
                onValueChange={(v) => v && setBoardFamily(v)}
              >
                <SelectTrigger aria-label={'Board family'}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {families.map((f) => (
                    <SelectItem value={f} key={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
            <div className="board-catalog">
              {visibleBoards.map((b) => (
                <article
                  className={'board-card ' + (b.id === boardId ? 'chosen' : '')}
                  key={b.id}
                >
                  <ProductPhoto
                    id={b.id}
                    name={b.name}
                    className="catalog-board-photo"
                    inspect
                  />
                  <div className="board-card-top">
                    <small>{b.family}</small>
                    <span
                      className={
                        'support-chip ' + (b.profile ? 'supported' : '')
                      }
                    >
                      {b.profile ? 'Code + pins' : 'Catalog'}
                    </span>
                  </div>

                  <h3>{b.name}</h3>
                  <p>{b.description}</p>
                  <div className="board-chips">
                    <span>{b.logicVoltage ?? '?'} V logic</span>
                    <span>{b.analogInputs ?? '?'} analog</span>
                  </div>
                  <div className="mcu-line">{b.mcu}</div>
                  <details>
                    <summary>Board notes and image source</summary>
                    <PhotoCredit id={b.id} />
                    <ul>
                      {b.notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </details>
                  <div className="board-card-footer">
                    <a href={b.sourceUrl} target="_blank" rel="noreferrer">
                      Official documentation <ExternalLink size={12} />
                    </a>
                    <Button
                      size="sm"
                      variant={b.id === boardId ? 'default' : 'outline'}
                      onClick={() => {
                        setBoardId(b.id);
                        setView('studio');
                      }}
                    >
                      {b.id === boardId ? 'Selected' : 'Select board'}
                      <ArrowRight size={13} />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
            {!visibleBoards.length && (
              <p className="empty-copy">No boards match your search.</p>
            )}
          </TabsContent>
          <TabsContent value="parts">
            <section className="catalog-intro">
              <div>
                <h2>Component library.</h2>
                <p>
                  Bare chips and breakout modules have different electrical
                  profiles. Match the exact manufacturer variant.
                </p>
              </div>
              <label className="search-field">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label={'Search the component catalog'}
                  placeholder={'Search components…'}
                />
              </label>
              <Select
                value={category}
                onValueChange={(v) => v && setCategory(v)}
              >
                <SelectTrigger aria-label={'Catalog category'}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem value={c} key={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
            <div className="parts-catalog">{visibleParts.map(catalogCard)}</div>
            {!visibleParts.length && (
              <p className="empty-copy">No components match your search.</p>
            )}
          </TabsContent>
        </Tabs>
        <footer className="studio-footer">
          <span>
            <CircuitBoard size={14} /> CIRCUIT FORGE <b>Embedded Studio</b>
          </span>
          <p>
            A sourced catalog and rule-based wiring planner. Filter AI uses a
            separate learning-based optimization model.
          </p>
          <a href="/research">
            Validation report <ArrowRight size={13} />
          </a>
        </footer>
      </main>
      <output className="studio-notice" aria-live="polite">
        {notice}
      </output>
    </div>
  );
}
