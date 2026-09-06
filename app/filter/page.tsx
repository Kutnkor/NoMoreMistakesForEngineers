'use client';
import { SallenKeySchematic as Schematic } from '@/components/breadboard/sallen-key-schematic';
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Inline SVG charts use role=img to expose their accessible descriptions. */
/* oxlint-disable next/no-html-link-for-pages -- This static export uses native page navigation, including disposal of page-scoped workers. */
import '../studio.css';
import { ProductPhoto } from '@/components/studio/product-photo';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircuitBoard,
  FlaskConical,
  Info,
  Play,
  RotateCcw,
  Square,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  analyze,
  DEFAULT_SPECS,
  REFERENCE,
  PART_KEYS,
  formatPart,
  gainDb,
  spiceNetlist,
  validateSpecs,
  type Specs,
  type Parts,
  type CurvePoint,
} from '@/lib/circuit';
import type { Experiment, Update, Trial } from '@/lib/optimizer';

const hz = (v: number) =>
  v >= 1000 ? `${+(v / 1000).toPrecision(3)}k` : `${+v.toPrecision(3)}`;
const fixed = (v: number, n = 2) => v.toFixed(n);
const initialFields = Object.fromEntries(
  Object.entries(DEFAULT_SPECS).map(([k, v]) => [k, String(v)]),
) as Record<keyof Specs, string>;
function readSpecs(fields: Record<keyof Specs, string>): Specs {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [
      k,
      v.trim() === '' ? NaN : Number(v),
    ]),
  ) as Specs;
}
function download(name: string, content: string, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function BodePlot({
  curve,
  specs,
  baseline,
}: {
  curve: CurvePoint[];
  specs: Specs;
  baseline?: Parts;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 860,
    H = 330,
    L = 62,
    R = 22,
    T = 22,
    B = 46,
    low = specs.passHz / 20,
    high = specs.stopHz * 20;
  const ymin = -Math.max(50, Math.ceil((specs.stopDb + 12) / 10) * 10),
    ymax = 6;
  const x = (f: number) =>
    L + (Math.log(f / low) / Math.log(high / low)) * (W - L - R);
  const y = (g: number) => T + ((ymax - g) / (ymax - ymin)) * (H - T - B);
  const path = (values: { hz: number; value: number }[]) =>
    values
      .map(
        (p, i) =>
          `${i ? 'L' : 'M'}${x(p.hz).toFixed(2)},${y(p.value).toFixed(2)}`,
      )
      .join(' ');
  const nominal = path(curve.map((p) => ({ hz: p.hz, value: p.nominal })));
  const area =
    path(curve.map((p) => ({ hz: p.hz, value: p.high }))) +
    ' ' +
    [...curve]
      .reverse()
      .map((p) => `L${x(p.hz).toFixed(2)},${y(p.low).toFixed(2)}`)
      .join(' ') +
    ' Z';
  const ticks: number[] = [];
  for (
    let decade = Math.floor(Math.log10(low));
    decade <= Math.ceil(Math.log10(high));
    decade++
  )
    for (const m of [1, 2, 5]) {
      const f = m * 10 ** decade;
      if (f >= low && f <= high) ticks.push(f);
    }
  const yticks = [
    0,
    ...Array.from({ length: Math.floor(-ymin / 10) }, (_, i) => -(i + 1) * 10),
  ];
  const hp = hover === null ? null : curve[hover];
  return (
    <div className="bode-wrap">
      <svg
        className="bode"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Frequency response. Passband edge ${specs.passHz} Hz, stopband edge ${specs.stopHz} Hz. Gain in decibels; frequency on a logarithmic axis.`}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect(),
            px = ((event.clientX - box.left) / box.width) * W;
          setHover(
            Math.max(
              0,
              Math.min(
                curve.length - 1,
                Math.round(((px - L) / (W - L - R)) * (curve.length - 1)),
              ),
            ),
          );
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id="plot-clip">
            <rect x={L} y={T} width={W - L - R} height={H - T - B} />
          </clipPath>
          <linearGradient id="band-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#008a93" stopOpacity=".26" />
            <stop offset="1" stopColor="#008a93" stopOpacity=".08" />
          </linearGradient>
        </defs>
        <rect
          x={L}
          y={T}
          width={x(specs.passHz) - L}
          height={H - T - B}
          fill="#008a93"
          opacity=".025"
        />
        <rect
          x={x(specs.stopHz)}
          y={T}
          width={W - R - x(specs.stopHz)}
          height={H - T - B}
          fill="#7ba4d1"
          opacity=".025"
        />
        {ticks.map((f) => (
          <g key={f}>
            <line x1={x(f)} x2={x(f)} y1={T} y2={H - B} stroke="#e0e8ed" />
            <text
              x={x(f)}
              y={H - 21}
              textAnchor="middle"
              fill="#586e7b"
              fontSize="12"
            >
              {hz(f)}
            </text>
          </g>
        ))}
        {yticks.map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="#e0e8ed" />
            <text
              x={L - 12}
              y={y(g) + 4}
              textAnchor="end"
              fill="#586e7b"
              fontSize="12"
            >
              {g}
            </text>
          </g>
        ))}
        <text x={L - 12} y={14} textAnchor="end" fill="#586e7b" fontSize="12">
          dB
        </text>
        <text x={W - R} y={H - 3} textAnchor="end" fill="#586e7b" fontSize="12">
          FREQUENCY / Hz
        </text>
        <g clipPath="url(#plot-clip)">
          <path
            d={`M${L},${y(-specs.rippleDb)}H${x(specs.passHz)}V${y(specs.rippleDb)}H${L}`}
            fill="#008a93"
            fillOpacity=".06"
            stroke="#52a7ad"
            strokeDasharray="4 5"
          />
          <path
            d={`M${x(specs.stopHz)},${H - B}V${y(-specs.stopDb)}H${W - R}`}
            fill="none"
            stroke="#80a7c7"
            strokeDasharray="4 5"
          />
          <path d={area} fill="url(#band-fill)" />
          {baseline && (
            <path
              d={path(
                curve.map((p) => ({ hz: p.hz, value: gainDb(baseline, p.hz) })),
              )}
              fill="none"
              stroke="#5b83c7"
              strokeWidth="2"
              strokeDasharray="7 5"
            />
          )}
          <path
            d={nominal}
            fill="none"
            stroke="#008a93"
            strokeWidth="2.7"
            strokeLinejoin="round"
          />
          {hp && (
            <>
              <line
                x1={x(hp.hz)}
                x2={x(hp.hz)}
                y1={T}
                y2={H - B}
                stroke="#a2b5c0"
                strokeDasharray="3 4"
              />
              <circle cx={x(hp.hz)} cy={y(hp.nominal)} r="4" fill="#008a93" />
            </>
          )}
        </g>
        <text
          x={x(specs.passHz) - 7}
          y={H - B - 10}
          textAnchor="end"
          fill="#007881"
          fontSize="12"
        >
          fₚ {hz(specs.passHz)}
        </text>
        <text
          x={x(specs.stopHz) + 7}
          y={H - B - 10}
          fill="#507395"
          fontSize="12"
        >
          fₛ {hz(specs.stopHz)}
        </text>
      </svg>
      <div className="plot-readout" aria-live="off">
        {hp ? (
          <>
            <span>{fixed(hp.hz, 0)} Hz</span>
            <span>{fixed(hp.nominal)} dB</span>
            <span>
              5–95%: {fixed(hp.low)} / {fixed(hp.high)} dB
            </span>
          </>
        ) : (
          <>
            <span className="legend">
              <i /> Nominal
            </span>
            <span className="legend band">
              <i /> 5–95% tolerance band
            </span>
            {baseline && (
              <span className="legend baseline">
                <i /> Random search
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LearningPlot({ ai, random }: { ai: Trial[]; random: Trial[] }) {
  const W = 780,
    H = 225,
    L = 52,
    R = 20,
    T = 20,
    B = 38,
    values = [...ai, ...random].map((t) => Math.asinh(t.bestScore)),
    min = Math.min(-0.1, ...values),
    max = Math.max(0.5, ...values),
    span = max - min || 1;
  const x = (i: number) =>
      L + ((i - 1) / Math.max(1, ai.length - 1)) * (W - L - R),
    y = (v: number) => T + ((max - Math.asinh(v)) / span) * (H - T - B);
  const p = (a: Trial[]) =>
    a
      .map((t, i) => `${i ? 'L' : 'M'}${x(t.iteration)},${y(t.bestScore)}`)
      .join(' ');
  return (
    <svg
      className="learning-plot"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={
        'Best training score versus evaluation count for AI and random search. Lower is better; below zero, at least 95% of training draws meet the targets.'
      }
    >
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line
            x1={L}
            x2={W - R}
            y1={T + t * (H - T - B)}
            y2={T + t * (H - T - B)}
            stroke="#dfe9ef"
          />
          <text
            x={L - 9}
            y={T + t * (H - T - B) + 4}
            textAnchor="end"
            fill="#586e7b"
            fontSize="12"
          >
            {Math.sinh(max - t * span).toFixed(1)}
          </text>
        </g>
      ))}
      {min < 0 && (
        <line
          x1={L}
          x2={W - R}
          y1={y(0)}
          y2={y(0)}
          stroke="#7fc0c5"
          strokeDasharray="4 4"
        />
      )}
      <path
        d={p(random)}
        fill="none"
        stroke="#5b83c7"
        strokeWidth="2"
        strokeDasharray="6 4"
      />
      <path d={p(ai)} fill="none" stroke="#008a93" strokeWidth="2.5" />
      {[1, Math.max(1, Math.round(ai.length / 2)), ai.length].map((i, k) => (
        <text
          key={k}
          x={x(i)}
          y={H - 15}
          textAnchor="middle"
          fill="#586e7b"
          fontSize="12"
        >
          {i}
        </text>
      ))}
      <text x={W - R} y={H - 1} textAnchor="end" fill="#586e7b" fontSize="12">
        CANDIDATE EVALUATIONS
      </text>
    </svg>
  );
}
function Stat({
  label,
  value,
  unit,
  detail,
  good,
}: {
  label: string;
  value: string;
  unit?: string;
  detail: string;
  good?: boolean;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={good === false ? 'warning-text' : ''}>
        {value}
        <small>{unit}</small>
      </strong>
      <p>
        {good !== undefined && (
          <span className={good ? 'checkmark' : 'warning-text'}>
            {good ? '✓' : '↗'}{' '}
          </span>
        )}
        {detail}
      </p>
    </div>
  );
}
function Method() {
  return (
    <div className="method-content">
      <div className="method-intro">
        <FlaskConical />
        <div>
          <h3>One experiment, two search methods.</h3>
          <p>
            The model learns from evaluated designs. It estimates expected
            improvement and simulates the most promising next candidate.
          </p>
        </div>
      </div>
      <div className="method-grid">
        <article>
          <span>01</span>
          <h3>Circuit model</h3>
          <p>
            Unity-gain Sallen–Key low-pass filter with an ideal op-amp. R₁/R₂:
            1–100 kΩ; C₁/C₂: 1–100 nF. Candidates are rounded to E24 values
            before evaluation.
          </p>
          <code>H(s) = 1 / [1 + sC₂(R₁+R₂) + s²R₁R₂C₁C₂]</code>
          <p>
            f₀ is the natural frequency; it is not generally the −3 dB cutoff
            frequency. Band checks also include any resonance peak.
          </p>
        </article>
        <article>
          <span>02</span>
          <h3>How the model learns</h3>
          <p>
            The Gaussian process is refitted in logarithmic component space
            after each result. It uses a Matérn 5/2 kernel and expected
            improvement. Both methods share the first 8 Latin hypercube
            candidates.
          </p>
          <p>
            The score is the 95th percentile of the maximum normalized band
            violation over 48 fixed tolerance draws. Lower is better; a negative
            score indicates that most training samples meet the targets.
          </p>
        </article>
        <article>
          <span>03</span>
          <h3>Independent evaluation</h3>
          <p>
            The best circuits are selected using training scores only, then
            evaluated on 1,024 tolerance draws from a separate seed. R and C
            deviations are independent and uniformly distributed within the
            specified range.
          </p>
          <p>
            Yield is the fraction of simulations meeting the targets under these
            assumptions. The confidence interval is a 95% Wilson interval. The
            16 corner checks provide additional information, not proof over the
            entire tolerance space.
          </p>
        </article>
        <article>
          <span>04</span>
          <h3>Scope and limitations</h3>
          <p>
            The browser uses an analytical AC model. ngspice does not run here;
            exported netlists can be opened in a separate SPICE simulator.
          </p>
          <p>
            Op-amp bandwidth, noise, saturation, slew rate, ESR, and parasitics
            are not modeled here. A single seed does not establish superiority;
            repeat the experiment with different seeds.
          </p>
        </article>
      </div>
      <div className="source-links">
        <a
          href="https://www.ti.com/lit/an/sloa024b/sloa024b.pdf"
          target="_blank"
          rel="noreferrer"
        >
          TI · Sallen–Key analysis <ArrowUpRight size={14} />
        </a>
        <a
          href="https://gaussianprocess.org/gpml/chapters/RW2.pdf"
          target="_blank"
          rel="noreferrer"
        >
          Gaussian process regression <ArrowUpRight size={14} />
        </a>
        <a
          href="https://ngspice.sourceforge.io/shared.html"
          target="_blank"
          rel="noreferrer"
        >
          ngspice <ArrowUpRight size={14} />
        </a>
      </div>
    </div>
  );
}

export default function Home() {
  const [fields, setFields] = useState(initialFields),
    [experiment, setExperiment] = useState<Experiment | null>(null),
    [progress, setProgress] = useState<Update | null>(null),
    [running, setRunning] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [selection, setSelection] = useState(0),
    [tab, setTab] = useState('circuit'),
    [activeSpecs, setActiveSpecs] = useState<Specs>(DEFAULT_SPECS);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const example = useMemo(() => analyze(REFERENCE, DEFAULT_SPECS, 128), []);
  const selected = experiment?.candidates[selection];
  const parts = selected?.trial.parts ?? REFERENCE,
    analysis = selected?.analysis ?? example,
    specs = experiment?.specs ?? DEFAULT_SPECS;
  const dirty =
    !!experiment &&
    JSON.stringify(readSpecs(fields)) !== JSON.stringify(experiment.specs);
  const traces = progress ?? experiment;
  function setField(k: keyof Specs, v: string) {
    setFields((old) => ({ ...old, [k]: v }));
    setError('');
  }
  function start() {
    const s = readSpecs(fields),
      problem = validateSpecs(s);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setNotice('');
    setSelection(0);
    setActiveSpecs(s);
    setProgress(null);
    setRunning(true);
    setTab('learning');
    try {
      worker.current?.terminate();
      const w = new Worker(
        new URL('../../lib/optimizer.worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.current = w;
      w.onmessage = (event) => {
        if (event.data.type === 'progress') {
          setProgress(event.data.data);
        } else if (event.data.type === 'complete') {
          setExperiment(event.data.data);
          setProgress(null);
          setRunning(false);
          setTab('circuit');
          setNotice(
            'Experiment complete. Results were evaluated with 1,024 independent tolerance draws.',
          );
          w.terminate();
          worker.current = null;
        } else {
          setError(event.data.message);
          setProgress(null);
          setRunning(false);
          w.terminate();
          worker.current = null;
        }
      };
      w.onerror = () => {
        setError(
          'Could not start the calculation. Refresh the page and try again.',
        );
        setProgress(null);
        setRunning(false);
        w.terminate();
        worker.current = null;
      };
      w.postMessage(s);
    } catch {
      setRunning(false);
      setError(
        'The browser could not start the calculation engine. Try again with an up-to-date browser.',
      );
    }
  }
  function stop() {
    worker.current?.terminate();
    worker.current = null;
    setRunning(false);
    setProgress(null);
    setNotice('Experiment stopped. The last completed results were retained.');
  }
  function exportReport() {
    if (!experiment) return;
    download(
      'circuit-forge-experiment.json',
      JSON.stringify(
        {
          schema: 'circuit-forge/1.0',
          exportedAt: new Date().toISOString(),
          model:
            'Ideal unity-gain Sallen-Key, analytic AC; no ngspice executed',
          assumptions:
            'Independent uniform component tolerances; ideal buffer; no parasitics',
          objective:
            '95th percentile of max(passDeviation/rippleDb-1, 1-stopAttenuation/stopDb) over fixed training draws',
          optimizer:
            'Gaussian process, Matern 5/2, lengthscale 0.38, expected improvement, asinh score transform; 8 shared LHS initial points',
          boundsSI: { R: [1000, 100000], C: [1e-9, 1e-7] },
          rounding: 'E24 before evaluation',
          selectedCandidate: selection,
          ...experiment,
        },
        null,
        2,
      ),
      'application/json',
    );
  }
  function sendToArduino() {
    const query = new URLSearchParams({
      mode: 'filter',
      r1: String(parts.r1),
      r2: String(parts.r2),
      c1: String(parts.c1),
      c2: String(parts.c2),
      passHz: String(specs.passHz),
      stopHz: String(specs.stopHz),
    });
    window.location.assign('/?' + query.toString());
  }
  function exportCSV() {
    if (!experiment) return;
    const rows = [
      'method,iteration,phase,R1_ohm,R2_ohm,C1_farad,C2_farad,training_score,best_training_score',
    ];
    for (const [method, list] of [
      ['bayesian', experiment.ai],
      ['random', experiment.random],
    ] as const)
      for (const t of list)
        rows.push(
          [
            method,
            t.iteration,
            t.phase,
            ...PART_KEYS.map((k) => t.parts[k]),
            t.score,
            t.bestScore,
          ].join(','),
        );
    download('circuit-forge-denemeler.csv', rows.join('\n'), 'text/csv');
  }
  const field = (
    key: keyof Specs,
    label: string,
    unit: string,
    step = 'any',
  ) => (
    <div>
      <label className="field-label" htmlFor={key}>
        {label}
      </label>
      <div className="unit-input">
        <Input
          id={key}
          type="number"
          inputMode="decimal"
          step={step}
          value={fields[key]}
          onChange={(e) => setField(key, e.target.value)}
          aria-invalid={!!error}
        />
        <span>{unit}</span>
      </div>
    </div>
  );
  const status = running
    ? 'EXPERIMENT RUNNING'
    : experiment
      ? 'EXPERIMENT COMPLETE'
      : 'REFERENCE CIRCUIT';
  return (
    <main className="forge">
      <header className="topbar">
        <div className="brand">
          <CircuitBoard size={28} />
          <span>
            CIRCUIT<span className="brand-light">FORGE</span>
          </span>
          <span className="version">LAB / 01</span>
        </div>
        <div className="header-right">
          <a href="/" className="studio-return">
            ← Hardware Studio
          </a>
          <span className="live-label">
            <i /> COMPUTED IN YOUR BROWSER
          </span>
          <Button
            variant="ghost"
            className="method-link"
            onClick={() => {
              setTab('method');
              document
                .getElementById('details')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            Method <ArrowUpRight size={16} />
          </Button>
        </div>
      </header>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">ELECTRONICS × MACHINE LEARNING</p>
          <h1>
            Define your targets. <span>Discover your circuit.</span>
          </h1>
        </div>
        <div className="heading-meta">
          <span className="mono">SALLEN–KEY / LOW-PASS</span>
          <p>Bayesian optimization laboratory</p>
        </div>
      </div>
      <div className="workbench">
        <aside className="panel control-panel">
          <div className="section-label">01 / DESIGN TARGETS</div>
          <h2>Define your filter</h2>
          <p className="muted">Two-pole · Unity gain</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
          >
            <fieldset disabled={running}>
              {field('passHz', 'Passband edge', 'Hz')}
              {field('stopHz', 'Stopband edge', 'Hz')}
              <div className="two-fields">
                {field('rippleDb', 'Max. passband deviation', 'dB')}
                {field('stopDb', 'Min. attenuation', 'dB')}
              </div>
              <div className="form-divider">
                <span>COMPONENT TOLERANCES</span>
              </div>
              <div className="two-fields">
                {field('rTol', 'Resistor ±', '%')}
                {field('cTol', 'Capacitor ±', '%')}
              </div>
              <div className="form-divider">
                <span>EXPERIMENT SETTINGS</span>
              </div>
              <label
                className="field-label"
                id="budget-label"
                htmlFor="budget-select"
              >
                Evaluations per method
              </label>
              <Select
                value={fields.budget}
                onValueChange={(v) => {
                  if (v) setField('budget', v);
                }}
                items={{
                  '32': '32 · Quick experiment',
                  '64': '64 · Standard',
                  '96': '96 · Extended search',
                }}
              >
                <SelectTrigger
                  id="budget-select"
                  className="budget-select"
                  aria-labelledby="budget-label"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="32">32 · Quick experiment</SelectItem>
                  <SelectItem value="64">64 · Standard</SelectItem>
                  <SelectItem value="96">96 · Extended search</SelectItem>
                </SelectContent>
              </Select>
              {field('seed', 'Reproducibility seed', '#', '1')}
              <Button type="submit" className="run-button">
                <Play size={16} fill="currentColor" />{' '}
                {experiment ? 'Start a new experiment' : 'Start optimization'}{' '}
                <ChevronRight size={16} />
              </Button>
            </fieldset>
            {running && (
              <Button
                type="button"
                variant="outline"
                className="stop-button"
                onClick={stop}
              >
                <Square size={14} /> Stop experiment
              </Button>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </form>
          <div className="control-foot">
            <span>
              <Check size={14} /> E24 component values
            </span>
            <span>
              <Check size={14} /> Equal-budget comparison
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={running}
              onClick={() => {
                setFields(initialFields);
                setError('');
              }}
            >
              <RotateCcw size={13} /> Default targets
            </Button>
          </div>
        </aside>
        <div className="results-column">
          <section className="panel response-panel">
            <div className="panel-heading">
              <div>
                <div className="section-label">02 / FREQUENCY RESPONSE</div>
                <h2>
                  {selected ? `AI design ${selection + 1}` : 'Reference design'}
                </h2>
              </div>
              <span className={`status-pill ${running ? 'working' : ''}`}>
                <i />
                {status}
              </span>
            </div>
            {!experiment && (
              <p className="example-note">
                A known example is shown to help you start. Run an experiment
                with your targets; this circuit is not injected into the search.
              </p>
            )}
            {dirty && !running && (
              <p className="changed-note">
                Targets have changed. Charts show the last completed experiment;
                start a new run for the updated targets.
              </p>
            )}
            {running && (
              <div className="run-progress">
                <div>
                  <span>
                    {(progress?.iteration ?? 0) < 8
                      ? 'Evaluating the initial candidates…'
                      : 'The model is learning and evaluating new circuits…'}
                  </span>
                  <strong>
                    {progress?.iteration ?? 0} / {activeSpecs.budget}
                  </strong>
                </div>
                <Progress
                  value={
                    (100 * (progress?.iteration ?? 0)) / activeSpecs.budget
                  }
                  aria-label={'Optimization progress'}
                />
                <p>
                  The displayed circuit is the last completed result. It will
                  update when the new experiment finishes.
                </p>
              </div>
            )}
            <BodePlot
              curve={analysis.curve}
              specs={specs}
              baseline={experiment?.baseline.trial.parts}
            />
            <div className="stats-grid">
              <Stat
                label={'Passband deviation'}
                value={fixed(analysis.nominal.passDeviation)}
                unit="dB"
                detail={`Target ≤ ${specs.rippleDb} dB`}
                good={analysis.nominal.passDeviation <= specs.rippleDb}
              />
              <Stat
                label={'Attenuation'}
                value={fixed(analysis.nominal.stopAttenuation)}
                unit="dB"
                detail={`${hz(specs.stopHz)} Hz and above · ≥ ${specs.stopDb} dB`}
                good={analysis.nominal.stopAttenuation >= specs.stopDb}
              />
              <Stat
                label={'Estimated tolerance yield'}
                value={fixed(analysis.yieldPct, 1)}
                unit="%"
                detail={`${analysis.passed}/${analysis.samples} simulations meet targets`}
              />
            </div>
          </section>
          <section className="panel details-panel" id="details">
            <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
              <div className="detail-tabs">
                <TabsList variant="line">
                  <TabsTrigger value="circuit">
                    <CircuitBoard size={16} /> Circuit
                  </TabsTrigger>
                  <TabsTrigger value="learning">
                    <Activity size={16} /> Learning
                  </TabsTrigger>
                  <TabsTrigger value="method">
                    <FlaskConical size={16} /> Method
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="circuit">
                <div className="circuit-body">
                  <div className="schematic-area">
                    <div className="subheading">
                      <h3>Unity-gain Sallen–Key</h3>
                      <span className="small muted">Ideal AC model</span>
                    </div>
                    <Schematic parts={parts} />
                    <a
                      className="source-link"
                      href={
                        '/breadboard?' +
                        new URLSearchParams({
                          r1: String(parts.r1),
                          r2: String(parts.r2),
                          c1: String(parts.c1),
                          c2: String(parts.c2),
                        })
                      }
                    >
                      Build this circuit on the 2D / 3D breadboard →
                    </a>
                    <div className="circuit-parameters">
                      <span>
                        f₀ <strong>{fixed(analysis.nominal.f0, 0)} Hz</strong>
                      </span>
                      <span>
                        Q <strong>{fixed(analysis.nominal.q, 3)}</strong>
                      </span>
                      <span>
                        DC gain <strong>0 dB</strong>
                      </span>
                    </div>
                  </div>
                  <div className="component-list">
                    <div className="section-label">COMPONENTS</div>
                    <div className="filter-material-photos">
                      <ProductPhoto
                        id="resistor"
                        name={'Resistor — representative photograph'}
                        inspect
                      />
                      <ProductPhoto
                        id="ceramic-capacitor"
                        name={'Capacitor — representative photograph'}
                        inspect
                      />
                    </div>
                    {PART_KEYS.map((k, i) => (
                      <div key={k}>
                        <span>
                          {k[0].toUpperCase()}
                          <sub>{k[1]}</sub>
                        </span>
                        <strong>
                          {formatPart(parts[k], i < 2 ? 'R' : 'C')}
                        </strong>
                        <span>±{i < 2 ? specs.rTol : specs.cTol}%</span>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      onClick={() =>
                        download(
                          'circuit-forge.cir',
                          spiceNetlist(parts, specs),
                        )
                      }
                    >
                      <ArrowDownToLine size={14} /> SPICE netlist
                    </Button>
                  </div>
                </div>
                <div className="filter-bridge">
                  <div>
                    <strong>Measure this filter with Arduino.</strong>
                    <p>
                      Add the selected R/C values, analog input connection, and
                      sample readout code to the plan.
                    </p>
                  </div>
                  <Button variant="outline" onClick={sendToArduino}>
                    Add to Arduino plan <ArrowUpRight size={15} />
                  </Button>
                </div>
                <div className="tolerance-summary">
                  <div>
                    <Target size={19} />
                    <div>
                      <h3>
                        {experiment
                          ? 'Independent tolerance test'
                          : 'Reference tolerance sampling'}
                      </h3>
                      <p>
                        95% confidence interval: {fixed(analysis.yieldCI[0], 1)}
                        –{fixed(analysis.yieldCI[1], 1)}% · Independent uniform
                        component deviations
                      </p>
                    </div>
                  </div>
                  <span>
                    16 corners:{' '}
                    <strong>{fixed(analysis.cornerYield, 0)}%</strong> meet
                    targets
                  </span>
                </div>
              </TabsContent>
              <TabsContent value="learning">
                {traces && traces.ai.length > 0 ? (
                  <div className="learning-body">
                    <div className="subheading">
                      <div>
                        <h3>Learn from every evaluation.</h3>
                        <p className="small muted">
                          Best training score · Lower is better · asinh scale
                        </p>
                      </div>
                      <div className="learning-legend">
                        <span className="legend">
                          <i /> AI
                        </span>
                        <span className="legend baseline">
                          <i /> Random
                        </span>
                      </div>
                    </div>
                    <LearningPlot ai={traces.ai} random={traces.random} />
                    <div className="comparison">
                      <div>
                        <span>Bayesian search</span>
                        <strong>{fixed(traces.ai.at(-1)!.bestScore, 3)}</strong>
                        <p>
                          {traces.ai.length} candidates · 48 tolerance draws per
                          candidate
                        </p>
                      </div>
                      <div>
                        <span>Random search</span>
                        <strong className="blue">
                          {fixed(traces.random.at(-1)!.bestScore, 3)}
                        </strong>
                        <p>
                          {traces.random.length} candidates · identical
                          tolerance draws
                        </p>
                      </div>
                      {experiment && !running && (
                        <div>
                          <span>Total experiment time</span>
                          <strong>
                            {fixed(experiment.elapsedMs / 1000, 1)}{' '}
                            <small>s</small>
                          </strong>
                          <p>Search + independent evaluation</p>
                        </div>
                      )}
                    </div>
                    <p className="learning-note">
                      <Info size={15} /> Both methods share the first 8
                      candidates. A single experiment does not establish general
                      AI superiority. Learning can add computation time for this
                      inexpensive circuit model.
                    </p>
                  </div>
                ) : (
                  <div className="empty-learning">
                    <Activity size={28} />
                    <h3>Start your first experiment.</h3>
                    <p>
                      Compare the progress of AI and random search on the same
                      chart.
                    </p>
                    <Button variant="outline" onClick={start}>
                      Start experiment <ChevronRight size={14} />
                    </Button>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="method">
                <Method />
              </TabsContent>
            </Tabs>
          </section>
          {experiment && (
            <section className="panel alternatives-panel">
              <div className="panel-heading">
                <div>
                  <div className="section-label">03 / DESIGN COMPARISON</div>
                  <h2>Same target, different solutions.</h2>
                </div>
                <span className="small muted">
                  {experiment.testDraws.toLocaleString('en-US')} independent
                  draws
                </span>
              </div>
              <div className="table-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Design</TableHead>
                      <TableHead>Passband deviation</TableHead>
                      <TableHead>Attenuation</TableHead>
                      <TableHead>Test yield</TableHead>
                      <TableHead>Training score</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...experiment.candidates, experiment.baseline].map(
                      (c, i) => {
                        const isBaseline = i === experiment.candidates.length;
                        return (
                          <TableRow
                            key={i}
                            className={
                              !isBaseline && selection === i
                                ? 'selected-row'
                                : ''
                            }
                          >
                            <TableCell>
                              <span className={isBaseline ? 'blue' : 'lime'}>
                                {isBaseline ? 'Random search' : `AI ${i + 1}`}
                              </span>
                              {!isBaseline && i === 0 && (
                                <span className="best-tag">
                                  BEST TRAINING SCORE
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {fixed(c.analysis.nominal.passDeviation)} dB
                            </TableCell>
                            <TableCell>
                              {fixed(c.analysis.nominal.stopAttenuation)} dB
                            </TableCell>
                            <TableCell>
                              {fixed(c.analysis.yieldPct, 1)}%
                            </TableCell>
                            <TableCell>{fixed(c.trial.score, 3)}</TableCell>
                            <TableCell>
                              {!isBaseline && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={running}
                                  onClick={() => {
                                    setSelection(i);
                                    setTab('circuit');
                                  }}
                                  aria-label={`AI ${i + 1} show design`}
                                >
                                  {selection === i ? (
                                    <Check size={16} />
                                  ) : (
                                    <ArrowUpRight size={16} />
                                  )}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      },
                    )}
                  </TableBody>
                </Table>
              </div>
              {!experiment.candidates[0].analysis.nominal.meets && (
                <p className="result-warning">
                  The AI design with the best training score does not meet the
                  nominal targets. Inspect the alternatives or try a different
                  seed and a larger budget.
                </p>
              )}
              <div className="export-row">
                <p>
                  Selected by training score. Test yield does not guide the
                  search.
                </p>
                <div>
                  <Button variant="outline" onClick={exportCSV}>
                    <ArrowDownToLine size={14} /> Trial history CSV
                  </Button>
                  <Button variant="outline" onClick={exportReport}>
                    <ArrowDownToLine size={14} /> Experiment report JSON
                  </Button>
                </div>
              </div>
            </section>
          )}
          {notice && (
            <p className="notice" role="status">
              <Check size={16} />
              {notice}
            </p>
          )}
        </div>
      </div>
      <footer>
        <span>
          CIRCUIT FORGE <span className="muted">/ RESEARCH PROTOTYPE 1.0</span>
        </span>
        <span>
          Ideal model · Not validated on hardware{' '}
          <span className="footer-dot">·</span> Calculations stay on your
          device.
        </span>
      </footer>
    </main>
  );
}
