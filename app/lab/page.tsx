'use client';
/* oxlint-disable next/no-html-link-for-pages -- Native navigation terminates page-scoped simulation workers. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownToLine,
  BrainCircuit,
  ChevronRight,
  CircuitBoard,
  FlaskConical,
  Play,
  RefreshCw,
  Square,
  AudioWaveform,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { LabPlot } from '@/components/lab/plot';
import {
  DEFAULT_SPECS,
  PART_KEYS,
  validateSpecs,
  type Parts,
  type Specs,
} from '@/lib/circuit';
import {
  checkModel,
  finiteMetrics,
  finiteNetlist,
  modelCurve,
  type OpAmp,
  finiteAudit,
} from '@/lib/lab/realistic';
import {
  FAULT_LABELS,
  FAULT_NAMES,
  makeFaultSample,
  predictFault,
  type Fault,
  type FaultModel,
} from '@/lib/lab/faults';
import { sensorSignal } from '@/lib/lab/signal';
import type { BudgetExperiment, BudgetMethod } from '@/lib/lab/adaptive';
import faultReport from '@/research/fault-model-report.json';
import { saveFile } from '@/lib/save-file';
import '../studio.css';
import './lab.css';

const methodNames: Record<BudgetMethod, string> = {
  adaptive: 'Adaptive-budget AI',
  gp: 'Standard GP',
  random: 'Random search',
};
const methodColors: Record<BudgetMethod, string> = {
  adaptive: '#007f87',
  gp: '#7054b5',
  random: '#c27830',
};
const n = (x: number, d = 2) =>
  Number.isFinite(x)
    ? x.toLocaleString('en-US', { maximumFractionDigits: d })
    : '—';
const initial = {
  r1: '8.2',
  r2: '8.2',
  c1: '22',
  c2: '8.2',
  passHz: '1000',
  stopHz: '5000',
  rippleDb: '1',
  stopDb: '20',
  rTol: '1',
  cTol: '5',
  a0Db: '100',
  gbwMHz: '10',
  seed: '42',
};
type Fields = typeof initial;
type Audit = ReturnType<typeof finiteAudit>;
export default function LabPage() {
  const [tab, setTab] = useState('models'),
    [fields, setFields] = useState<Fields>(initial),
    [running, setRunning] = useState<'audit' | 'budget' | null>(null),
    [error, setError] = useState(''),
    [progress, setProgress] = useState({
      method: 'adaptive' as BudgetMethod,
      spent: 0,
      budget: 1536,
    }),
    [budget, setBudget] = useState('1536');
  const [audit, setAudit] = useState<{
      result: Audit;
      parts: Parts;
      specs: Specs;
      opAmp: OpAmp;
    } | null>(null),
    [experiment, setExperiment] = useState<BudgetExperiment | null>(null);
  const [fault, setFault] = useState<Fault>('c1-drift'),
    [faultSeed, setFaultSeed] = useState(101),
    [model, setModel] = useState<FaultModel | null>(null),
    [modelError, setModelError] = useState('');
  const [sampleHz, setSampleHz] = useState(200),
    [vibrationHz, setVibrationHz] = useState(450),
    [amplitude, setAmplitude] = useState(0.3);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/models/fault-mlp.json', { signal: abort.signal })
      .then(async (r) => {
        if (!r.ok) throw Error('Could not load the fault model.');
        const bytes = await r.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', bytes),
          hash = Array.from(new Uint8Array(digest))
            .map((x) => x.toString(16).padStart(2, '0'))
            .join('');
        if (hash !== faultReport.modelSha256)
          throw Error(
            'The model version does not match the report. Refresh the page.',
          );
        if (!abort.signal.aborted)
          setModel(JSON.parse(new TextDecoder().decode(bytes)) as FaultModel);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setModelError(e.message);
      });
    return () => abort.abort();
  }, []);
  const parts = useMemo<Parts>(
    () => ({
      r1: Number(fields.r1) * 1000,
      r2: Number(fields.r2) * 1000,
      c1: Number(fields.c1) * 1e-9,
      c2: Number(fields.c2) * 1e-9,
    }),
    [fields.r1, fields.r2, fields.c1, fields.c2],
  );
  const opAmp = useMemo<OpAmp>(
    () => ({ a0Db: Number(fields.a0Db), gbwHz: Number(fields.gbwMHz) * 1e6 }),
    [fields.a0Db, fields.gbwMHz],
  );
  const specs = useMemo<Specs>(
    () => ({
      ...DEFAULT_SPECS,
      ...Object.fromEntries(
        ['passHz', 'stopHz', 'rippleDb', 'stopDb', 'rTol', 'cTol', 'seed'].map(
          (k) => [k, Number(fields[k as keyof Fields])],
        ),
      ),
    }),
    [fields],
  );
  let validation = validateSpecs(specs);
  try {
    checkModel(parts, opAmp);
  } catch (e) {
    validation = e instanceof Error ? e.message : String(e);
  }
  const valid = !validation;
  const curves = useMemo(
    () =>
      valid
        ? modelCurve(parts, opAmp, specs.passHz / 20, specs.stopHz * 20)
        : [],
    [valid, parts, opAmp, specs.passHz, specs.stopHz],
  );
  const nominal = valid ? finiteMetrics(parts, specs, opAmp) : null;
  const faultDomain =
    valid &&
    PART_KEYS.every(
      (k, i) =>
        parts[k] >= (i < 2 ? 1000 : 1e-9) * (1 - 1e-9) &&
        parts[k] <= (i < 2 ? 100000 : 1e-7) * (1 + 1e-9),
    ) &&
    opAmp.a0Db >= 80 &&
    opAmp.a0Db <= 120 &&
    opAmp.gbwHz >= 1e5 &&
    opAmp.gbwHz <= 1e8;
  const sample = useMemo(
    () =>
      faultDomain ? makeFaultSample(parts, fault, faultSeed, opAmp) : null,
    [faultDomain, parts, fault, faultSeed, opAmp],
  );
  const diagnosis =
    sample && model ? predictFault(model, sample.features) : null;
  const signal = useMemo(
    () =>
      valid
        ? sensorSignal(parts, opAmp, sampleHz, vibrationHz, amplitude)
        : null,
    [valid, parts, opAmp, sampleHz, vibrationHz, amplitude],
  );
  function update(k: keyof Fields, value: string) {
    setFields((f) => ({ ...f, [k]: value }));
  }
  function field(k: keyof Fields, label: string, unit: string) {
    return (
      <label className="lab-field" htmlFor={'lab-' + k}>
        <span>{label}</span>
        <div>
          <Input
            id={'lab-' + k}
            type="number"
            step="any"
            value={fields[k]}
            onChange={(e) => update(k, e.target.value)}
            disabled={!!running}
          />
          <small>{unit}</small>
        </div>
      </label>
    );
  }
  function run(type: 'audit' | 'budget') {
    if (validation) {
      setError(validation);
      return;
    }
    worker.current?.terminate();
    setError('');
    setRunning(type);
    setProgress({ method: 'adaptive', spent: 0, budget: Number(budget) });
    const w = new Worker(
      new URL('../../lib/lab/lab.worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.current = w;
    const snapshot = {
      parts: { ...parts },
      specs: { ...specs },
      opAmp: { ...opAmp },
    };
    w.onmessage = (e) => {
      const data = e.data;
      if (data.type === 'progress')
        setProgress({
          method: data.method,
          spent: data.spent,
          budget: data.budget,
        });
      else if (data.type === 'complete') {
        if (type === 'audit') setAudit({ ...snapshot, result: data.result });
        else setExperiment(data.result);
        setRunning(null);
        w.terminate();
        worker.current = null;
      } else if (data.type === 'error') {
        setError(data.message);
        setRunning(null);
        w.terminate();
        worker.current = null;
      }
    };
    w.onerror = () => {
      setError('The calculation could not finish. Try again.');
      setRunning(null);
      w.terminate();
      worker.current = null;
    };
    w.postMessage({ type, ...snapshot, budget: Number(budget) });
  }
  function cancel() {
    worker.current?.terminate();
    worker.current = null;
    setRunning(null);
    setError('Experiment stopped. The previous completed result was retained.');
  }
  const budgetCurves = experiment
    ? Array.from({ length: 96 }, (_, i) => {
        const cost = 384 + ((experiment.budget - 384) * i) / 95;
        const row: Record<string, number> = { x: cost };
        for (const m of experiment.methods) {
          let spent = 0,
            best = Infinity;
          for (const h of m.history) {
            if (spent + h.cost > cost) break;
            spent += h.cost;
            if (h.bestFullScore !== null) best = h.bestFullScore;
          }
          row[m.method] = Math.asinh(best);
        }
        return row as { x: number; [key: string]: number };
      })
    : [];
  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <a className="studio-brand" href="/">
          <span className="brand-mark">
            <CircuitBoard size={23} />
          </span>
          <div>
            CIRCUIT<span>FORGE</span>
            <small>RESEARCH LAB</small>
          </div>
        </a>
        <nav>
          <a href="/">Hardware Studio</a>
          <span className="nav-active">AI Laboratory</span>
          <a href="/filter">Filter AI</a>
          <a href="/breadboard">Breadboard</a>
        </nav>
        <a className="source-link" href="/research">
          Research evidence <ArrowUpRight size={15} />
        </a>
      </header>
      <main className="studio-main lab-main">
        <div className="studio-heading">
          <div>
            <div className="eyebrow">
              EEE / COMPUTER ENGINEERING / AEROSPACE
            </div>
            <h1>Design. Test. Learn.</h1>
            <p>
              Explore one circuit through model comparisons, fault diagnosis,
              and design search.
            </p>
          </div>
          <span className="lab-topology">
            <CircuitBoard size={17} /> Sallen–Key · LP2
          </span>
        </div>
        <div className="lab-layout">
          <aside className="studio-panel lab-controls">
            <div className="panel-heading">
              <FlaskConical size={19} />
              <h2>Experiment settings</h2>
            </div>
            <div className="lab-control-body">
              <div className="lab-preset-buttons">
                <button disabled={!!running} onClick={() => setFields(initial)}>
                  1 kHz reference
                </button>
                <button
                  disabled={!!running}
                  onClick={() =>
                    setFields({
                      ...initial,
                      r1: '82',
                      r2: '82',
                      passHz: '100',
                      stopHz: '500',
                    })
                  }
                >
                  Sensor filter
                </button>
              </div>
              <div className="lab-section-label">REFERENCE CIRCUIT</div>
              <div className="lab-field-grid">
                {field('r1', 'R1', 'kΩ')}
                {field('r2', 'R2', 'kΩ')}
                {field('c1', 'C1', 'nF')}
                {field('c2', 'C2', 'nF')}
              </div>
              <div className="lab-section-label">OP-AMP MODEL</div>
              <div className="lab-field-grid">
                {field('a0Db', 'Open-loop gain', 'dB')}
                {field('gbwMHz', 'Gain-bandwidth product', 'MHz')}
              </div>
              <div className="lab-section-label">FILTER TARGET</div>
              <div className="lab-field-grid">
                {field('passHz', 'Passband edge', 'Hz')}
                {field('stopHz', 'Stopband edge', 'Hz')}
                {field('rippleDb', 'Allowed deviation', 'dB')}
                {field('stopDb', 'Required attenuation', 'dB')}
              </div>
              <div className="lab-section-label">TOLERANCES AND SEED</div>
              <div className="lab-field-grid">
                {field('rTol', 'Resistor ±', '%')}
                {field('cTol', 'Capacitor ±', '%')}
                {field('seed', 'Experiment seed', '#')}
              </div>
              {validation && (
                <p className="lab-error" role="alert">
                  {validation}
                </p>
              )}
              <p className="lab-model-note">
                Unity-gain linear AC model with a single-pole finite op-amp.
                Saturation, slew rate, temperature, and physical measurements
                are outside this model.
              </p>
            </div>
          </aside>
          <div className="lab-workspace">
            <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
              <TabsList className="lab-tabs">
                <TabsTrigger value="models">Model comparison</TabsTrigger>
                <TabsTrigger value="faults">Fault AI</TabsTrigger>
                <TabsTrigger value="budget">Adaptive search</TabsTrigger>
                <TabsTrigger value="signal">Sensor signal</TabsTrigger>
              </TabsList>
              <TabsContent value="models">
                <section className="studio-panel lab-card">
                  <div className="lab-card-heading">
                    <div>
                      <div className="eyebrow">01 / FREQUENCY RESPONSE</div>
                      <h2>What does the ideal model miss?</h2>
                    </div>
                    <Button
                      variant="outline"
                      disabled={!valid}
                      onClick={() =>
                        saveFile(
                          'finite-sallen-key.cir',
                          finiteNetlist(parts, specs, opAmp),
                        )
                      }
                    >
                      <ArrowDownToLine size={15} />
                      SPICE
                    </Button>
                  </div>
                  <LabPlot
                    title={
                      'Ideal and finite-bandwidth op-amp frequency response'
                    }
                    data={curves.map((p) => ({
                      x: p.hz,
                      ideal: p.ideal,
                      finite: p.finite,
                    }))}
                    logX
                    lines={[
                      {
                        key: 'ideal',
                        name: 'Ideal op-amp',
                        color: '#7795b5',
                        dash: true,
                      },
                      {
                        key: 'finite',
                        name: 'Finite bandwidth',
                        color: '#007f87',
                      },
                    ]}
                  />
                  {nominal && (
                    <div className="lab-metrics">
                      <div>
                        <small>Maximum passband deviation</small>
                        <strong>
                          {n(nominal.passDeviation)} <em>dB</em>
                        </strong>
                      </div>
                      <div>
                        <small>Minimum stopband attenuation</small>
                        <strong>
                          {n(nominal.stopAttenuation)} <em>dB</em>
                        </strong>
                      </div>
                      <div>
                        <small>Nominal targets</small>
                        <strong
                          className={
                            nominal.meets ? 'lab-success' : 'lab-caution'
                          }
                        >
                          {nominal.meets ? 'Met' : 'Not met'}
                        </strong>
                      </div>
                    </div>
                  )}
                  <div className="lab-run-row">
                    <div>
                      <h3>Compare 1,024 tolerance variations.</h3>
                      <p>The same R/C deviations are applied to both models.</p>
                    </div>
                    <Button
                      disabled={!valid || !!running}
                      onClick={() => run('audit')}
                    >
                      <Play size={15} />
                      {running === 'audit'
                        ? 'Calculating…'
                        : 'Tolerance experiment'}
                    </Button>
                  </div>
                  {audit && (
                    <div className="lab-result-block">
                      <div className="lab-result-caption">
                        Last completed experiment · {n(audit.specs.passHz, 0)}{' '}
                        Hz / {n(audit.specs.stopHz, 0)} Hz · GBW{' '}
                        {n(audit.opAmp.gbwHz / 1e6)} MHz · seed{' '}
                        {audit.specs.seed}
                      </div>
                      <div className="lab-metrics">
                        <div>
                          <small>Ideal-model yield</small>
                          <strong>{n(audit.result.idealYieldPct, 1)}%</strong>
                        </div>
                        <div>
                          <small>Finite-model yield</small>
                          <strong>{n(audit.result.yieldPct, 1)}%</strong>
                          <p>
                            95% interval: {n(audit.result.yieldCI[0], 1)}–
                            {n(audit.result.yieldCI[1], 1)}
                          </p>
                        </div>
                        <div>
                          <small>Pass ideal, fail finite</small>
                          <strong>
                            {audit.result.falsePass}
                            <em> / {audit.result.samples}</em>
                          </strong>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          saveFile(
                            'model-comparison.json',
                            JSON.stringify(audit, null, 2),
                            'application/json',
                          )
                        }
                      >
                        <ArrowDownToLine size={15} />
                        Experiment record
                      </Button>
                    </div>
                  )}
                  <details className="lab-details">
                    <summary>How is this calculated?</summary>
                    <p>
                      All analytical peaks and troughs within the frequency
                      bands are checked. R and C deviations are independent and
                      uniform. Results describe variations of one nominal design
                      and do not generalize to every topology.
                    </p>
                    <p>
                      This single-topology engine was compared with ngspice 47
                      at 12,030 frequency points.{' '}
                      <a href="/research">Validation records</a>
                    </p>
                  </details>
                </section>
              </TabsContent>
              <TabsContent value="faults">
                <section className="studio-panel lab-card">
                  <div className="lab-card-heading">
                    <div>
                      <div className="eyebrow">02 / TRAINED NEURAL NETWORK</div>
                      <h2>Identify faults from the output response.</h2>
                    </div>
                    <BrainCircuit size={30} />
                  </div>
                  <p className="lab-description">
                    The model receives magnitude and phase differences at 12
                    frequencies relative to a known input and nominal circuit.
                    The fault label is not part of the prediction input.
                  </p>
                  <p className="lab-model-note">
                    Fixed data model for this section: R ±1%, C ±5%; Gaussian
                    noise with standard deviations of 0.15 dB in magnitude and
                    1° in phase.
                  </p>
                  <div className="lab-fault-controls">
                    <label htmlFor="fault-select">Injected condition</label>
                    <Select
                      value={fault}
                      onValueChange={(v) => {
                        if (v) setFault(v as Fault);
                      }}
                      items={FAULT_NAMES}
                    >
                      <SelectTrigger id="fault-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FAULT_LABELS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {FAULT_NAMES[f]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      onClick={() => setFaultSeed((s) => s + 1)}
                    >
                      <RefreshCw size={15} />
                      New measurement
                    </Button>
                  </div>
                  {!faultDomain ? (
                    <p className="lab-error">
                      Fault model training range: R 1–100 kΩ, C 1–100 nF, A₀
                      80–120 dB, GBW 0.1–100 MHz. Select the reference example
                      or adjust values to this range.
                    </p>
                  ) : (
                    <>
                      {sample && (
                        <LabPlot
                          title={
                            'Nominal response and measurement with an injected fault'
                          }
                          data={sample.curve.map((p) => ({
                            x: p.hz,
                            nominal: p.nominal,
                            observed: p.observed,
                          }))}
                          logX
                          lines={[
                            {
                              key: 'nominal',
                              name: 'Nominal response',
                              color: '#7795b5',
                              dash: true,
                            },
                            {
                              key: 'observed',
                              name: 'Synthetic measurement',
                              color: '#b76e2c',
                            },
                          ]}
                        />
                      )}
                      {diagnosis ? (
                        <div className="fault-diagnosis">
                          <div>
                            <small>MODEL PREDICTION</small>
                            <h3>
                              {diagnosis.predicted
                                ? FAULT_NAMES[diagnosis.predicted]
                                : 'Uncertain — measure again'}
                            </h3>
                            <p>
                              Measurement seed: {faultSeed}
                              {sample?.fault.includes('drift')
                                ? ` · value multiplier: ${n(sample.faultFactor)}×`
                                : ''}
                            </p>
                          </div>
                          <div className="fault-scores">
                            {diagnosis.scores.slice(0, 3).map((s) => (
                              <div key={s.label}>
                                <span>{FAULT_NAMES[s.label]}</span>
                                <div>
                                  <i style={{ width: s.score * 100 + '%' }} />
                                </div>
                                <b>{n(s.score * 100, 1)}%</b>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p>{modelError || 'Loading model…'}</p>
                      )}
                      {diagnosis && sample && (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            saveFile(
                              'fault-observation.json',
                              JSON.stringify(
                                {
                                  modelVersion: model?.version,
                                  sample,
                                  prediction: diagnosis,
                                  scoreNote:
                                    'Softmax scores, not calibrated probabilities',
                                },
                                null,
                                2,
                              ),
                              'application/json',
                            )
                          }
                        >
                          <ArrowDownToLine size={15} />
                          Download measurement and prediction
                        </Button>
                      )}
                    </>
                  )}
                  <div className="lab-test-strip">
                    <div>
                      <strong>{n(faultReport.test.top1AccuracyPct, 1)}%</strong>
                      <span>Top-scoring class correct</span>
                    </div>
                    <div>
                      <strong>
                        {faultReport.test.falseAlarms}/
                        {faultReport.test.healthySamples}
                      </strong>
                      <span>False alarms on healthy tests</span>
                    </div>
                    <div>
                      <strong>{faultReport.test.uncertain}</strong>
                      <span>Measurements marked uncertain</span>
                    </div>
                  </div>
                  <details className="lab-details">
                    <summary>Test scope and confusion matrix</summary>
                    <p>
                      800 training, 200 validation, and 200 test circuits, with
                      no overlapping circuit groups. The test set contains 1,200
                      synthetic measurements across six individual conditions.
                      Model scores are not calibrated probabilities; predictions
                      below 0.60 are marked uncertain. Real hardware and
                      simultaneous faults have not been tested.
                    </p>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Actual / predicted</th>
                            {faultReport.confusionColumns.map((c) => (
                              <th key={c}>
                                {c === 'uncertain'
                                  ? 'Uncertain'
                                  : FAULT_NAMES[c as Fault]}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {faultReport.confusionMatrix.map((row, i) => (
                            <tr key={i}>
                              <th>{FAULT_NAMES[FAULT_LABELS[i]]}</th>
                              {row.map((v, j) => (
                                <td key={j}>{v}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <a href="/reports/fault-model-report.json" download>
                      Model card and full results
                    </a>
                  </details>
                </section>
              </TabsContent>
              <TabsContent value="budget">
                <section className="studio-panel lab-card">
                  <div className="lab-card-heading">
                    <div>
                      <div className="eyebrow">
                        03 / EQUAL COMPUTATION BUDGET
                      </div>
                      <h2>Which candidates deserve detailed simulation?</h2>
                    </div>
                    <BrainCircuit size={30} />
                  </div>
                  <p className="lab-description">
                    The AI learns from an 8-draw tolerance screening stage and
                    promotes promising or uncertain candidates to 48 draws.
                    Standard GP and random search use the same total budget.
                  </p>
                  <div className="lab-run-row">
                    <div>
                      <label htmlFor="budget-control">
                        Circuit evaluations per method
                      </label>
                      <Select
                        value={budget}
                        onValueChange={(v) => {
                          if (v) setBudget(v);
                        }}
                        items={{
                          '768': '768 · Quick experiment',
                          '1536': '1,536 · Standard',
                          '3072': '3,072 · Extended search',
                        }}
                      >
                        <SelectTrigger id="budget-control" disabled={!!running}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[768, 1536, 3072].map((v) => (
                            <SelectItem key={v} value={String(v)}>
                              {n(v, 0)} evaluations
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      disabled={!valid || !!running}
                      onClick={() => run('budget')}
                    >
                      <Play size={15} />
                      Compare all three methods
                    </Button>
                  </div>
                  <p className="lab-model-note">
                    The search covers R 1–100 kΩ and C 1–100 nF. It uses the
                    filter targets, tolerances, and op-amp model; the reference
                    R/C values on the left are not used as an initial design.
                  </p>
                  {running === 'budget' && (
                    <div className="lab-progress">
                      <div>
                        <span>{methodNames[progress.method]}</span>
                        <strong>
                          {progress.spent} / {progress.budget}
                        </strong>
                      </div>
                      <progress max={progress.budget} value={progress.spent} />
                      <Button variant="outline" onClick={cancel}>
                        <Square size={13} />
                        Stop
                      </Button>
                    </div>
                  )}
                  {experiment && (
                    <>
                      <div className="lab-result-caption">
                        Last completed experiment ·{' '}
                        {n(experiment.specs.passHz, 0)} Hz /{' '}
                        {n(experiment.specs.stopHz, 0)} Hz · GBW{' '}
                        {n(experiment.opAmp.gbwHz / 1e6)} MHz · seed{' '}
                        {experiment.specs.seed}
                      </div>
                      <LabPlot
                        title={
                          'Best training violation under equal simulation budgets'
                        }
                        data={budgetCurves}
                        xLabel={'Circuit evaluations'}
                        yLabel={'asinh(score) · lower is better'}
                        lines={experiment.methods.map((m) => ({
                          key: m.method,
                          name: methodNames[m.method],
                          color: methodColors[m.method],
                          dash: m.method !== 'adaptive',
                        }))}
                      />
                      <div className="budget-results">
                        {experiment.methods.map((m) => (
                          <article key={m.method}>
                            <span
                              className="budget-method"
                              style={{ color: methodColors[m.method] }}
                            >
                              {methodNames[m.method]}
                            </span>
                            <h3>{n(m.audit.yieldPct, 1)}%</h3>
                            <p>Independent tolerance yield</p>
                            <small>
                              95% interval: {n(m.audit.yieldCI[0], 1)}–
                              {n(m.audit.yieldCI[1], 1)}
                            </small>
                            <dl>
                              <div>
                                <dt>Detailed candidates</dt>
                                <dd>{m.fullEvaluations}</dd>
                              </div>
                              <div>
                                <dt>Screening</dt>
                                <dd>{m.screens}</dd>
                              </div>
                              <div>
                                <dt>Budget spent</dt>
                                <dd>{m.spent}</dd>
                              </div>
                              <div>
                                <dt>Search time</dt>
                                <dd>{n(m.elapsedMs / 1000)} s</dd>
                              </div>
                            </dl>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setFields((f) => ({
                                  ...f,
                                  r1: String(m.winner.r1 / 1000),
                                  r2: String(m.winner.r2 / 1000),
                                  c1: String(m.winner.c1 / 1e-9),
                                  c2: String(m.winner.c2 / 1e-9),
                                  passHz: String(experiment.specs.passHz),
                                  stopHz: String(experiment.specs.stopHz),
                                  rippleDb: String(experiment.specs.rippleDb),
                                  stopDb: String(experiment.specs.stopDb),
                                  rTol: String(experiment.specs.rTol),
                                  cTol: String(experiment.specs.cTol),
                                  a0Db: String(experiment.opAmp.a0Db),
                                  gbwMHz: String(experiment.opAmp.gbwHz / 1e6),
                                  seed: String(experiment.specs.seed),
                                }));
                                setTab('models');
                              }}
                            >
                              Inspect circuit <ChevronRight size={14} />
                            </Button>
                          </article>
                        ))}
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          saveFile(
                            'adaptive-search.json',
                            JSON.stringify(experiment, null, 2),
                            'application/json',
                          )
                        }
                      >
                        <ArrowDownToLine size={15} />
                        Download all trials
                      </Button>
                    </>
                  )}
                  <details className="lab-details">
                    <summary>Rules for a fair comparison</summary>
                    <p>
                      8 shared initial circuits, 48 shared training tolerance
                      draws, and equal oracle budgets. Screening costs 8
                      evaluations; promotion costs 40 more and reuses the
                      original 8. GP predictions select detailed candidates by
                      expected improvement. Only candidates evaluated with all
                      48 draws can win.
                    </p>
                    <p>
                      Winners are frozen using training scores, then evaluated
                      on 1,024 new draws per method. These 3,072 final test
                      evaluations are outside the search budget. Timing includes
                      GP computation. One experiment does not establish
                      superiority; all method results are retained.
                    </p>
                  </details>
                </section>
              </TabsContent>
              <TabsContent value="signal">
                <section className="studio-panel lab-card">
                  <div className="lab-card-heading">
                    <div>
                      <div className="eyebrow">
                        04 / VIRTUAL SENSOR EXPERIMENT
                      </div>
                      <h2>Reduce noise while preserving the signal.</h2>
                    </div>
                    <AudioWaveform size={30} />
                  </div>
                  <p className="lab-description">
                    Vibration is added to a useful 12 Hz acceleration signal,
                    then the analog filter output is sampled. Start with the
                    “Sensor filter” example on the left.
                  </p>
                  <div className="signal-controls">
                    {[
                      {
                        label: 'Sampling rate',
                        value: sampleHz,
                        min: 100,
                        max: 1000,
                        step: 10,
                        unit: 'Hz',
                        set: setSampleHz,
                      },
                      {
                        label: 'Vibration frequency',
                        value: vibrationHz,
                        min: 100,
                        max: 2000,
                        step: 10,
                        unit: 'Hz',
                        set: setVibrationHz,
                      },
                      {
                        label: 'Vibration amplitude',
                        value: amplitude,
                        min: 0.05,
                        max: 0.8,
                        step: 0.05,
                        unit: 'g',
                        set: setAmplitude,
                      },
                    ].map((c) => (
                      <div key={c.label}>
                        <label>
                          {c.label}{' '}
                          <strong>
                            {n(c.value)} {c.unit}
                          </strong>
                        </label>
                        <Slider
                          aria-label={c.label}
                          min={c.min}
                          max={c.max}
                          step={c.step}
                          value={[c.value]}
                          onValueChange={(v) =>
                            c.set(Array.isArray(v) ? v[0] : v)
                          }
                        />
                      </div>
                    ))}
                  </div>
                  {signal && (
                    <>
                      <LabPlot
                        title={
                          'Synthetic acceleration signal and sampled response after analog filtering'
                        }
                        data={signal.points}
                        xLabel="ms"
                        yLabel="g"
                        lines={[
                          {
                            key: 'raw',
                            name: 'Raw measurement',
                            color: '#c8a477',
                          },
                          {
                            key: 'clean',
                            name: 'Desired signal',
                            color: '#738cab',
                            dash: true,
                          },
                          {
                            key: 'filtered',
                            name: 'Filtered measurement',
                            color: '#007f87',
                          },
                        ]}
                      />
                      <div className="lab-metrics">
                        <div>
                          <small>Raw → filtered RMS error</small>
                          <strong>
                            {n(signal.rawRmse, 3)} → {n(signal.filteredRmse, 3)}
                            <em> g</em>
                          </strong>
                        </div>
                        <div>
                          <small>Vibration attenuation</small>
                          <strong>
                            {n(signal.vibrationAttenuationDb)}
                            <em> dB</em>
                          </strong>
                        </div>
                        <div>
                          <small>Phase delay at 12 Hz</small>
                          <strong>
                            {n(signal.phaseDelayMs)}
                            <em> ms</em>
                          </strong>
                        </div>
                      </div>
                      <p className="lab-alias-note">
                        {vibrationHz >= sampleHz / 2
                          ? `${n(vibrationHz, 0)} Hz vibration appears after sampling at ${n(signal.aliasHz, 0)} Hz. The analog filter provides attenuation before sampling.`
                          : 'The vibration frequency is below the Nyquist limit.'}
                      </p>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          saveFile(
                            'sensor-signal.json',
                            JSON.stringify(
                              { parts, opAmp, ...signal },
                              null,
                              2,
                            ),
                            'application/json',
                          )
                        }
                      >
                        <ArrowDownToLine size={15} />
                        Download signal data
                      </Button>
                    </>
                  )}
                  <details className="lab-details">
                    <summary>Experiment assumptions</summary>
                    <p>
                      This is the linear steady-state response to two sinusoids.
                      It does not represent a real flight recording, transient
                      behavior, or ADC quantization. RMS error is measured
                      against the clean signal without time alignment, so delay
                      and signal distortion also contribute to the error.
                    </p>
                  </details>
                </section>
              </TabsContent>
            </Tabs>
            {error && (
              <p className="lab-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
        <footer className="studio-footer">
          <span>Computed on your device · download results as JSON</span>
          <a href="/research">
            Methods and validation <ArrowUpRight size={14} />
          </a>
          <a href="/">
            <ArrowLeft size={14} />
            Hardware Studio
          </a>
        </footer>
      </main>
    </div>
  );
}
