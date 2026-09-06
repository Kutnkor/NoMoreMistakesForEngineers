/* oxlint-disable next/no-html-link-for-pages -- This static export uses native page navigation, including disposal of page-scoped workers. */
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  CircuitBoard,
  Download,
  FlaskConical,
} from 'lucide-react';
import compiles from '@/research/arduino-compile-results.json';
import benchmark from '@/research/benchmark.json';
import fault from '@/research/fault-model-report.json';
import spice from '@/research/ngspice-validation.json';
import budget from '@/research/budget-benchmark.json';
import embedded from '@/research/embedded-validation.json';
import '../studio.css';
export default function EvidencePage() {
  const mean = (key: 'aiYield' | 'randomYield') =>
    benchmark.seeds.reduce((s, x) => s + x[key], 0) / benchmark.seeds.length;
  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <a className="studio-brand" href="/">
          <span className="brand-mark">
            <CircuitBoard size={23} />
          </span>
          <div>
            CIRCUIT<span>FORGE</span>
            <small>RESEARCH & VALIDATION</small>
          </div>
        </a>
        <a href="/" className="source-link">
          <ArrowLeft size={14} /> Hardware Studio
        </a>
      </header>
      <main className="studio-main evidence-main">
        <div className="studio-heading">
          <div>
            <div className="eyebrow">EVIDENCE / SEPTEMBER 5, 2026</div>
            <h1>Measurable engineering.</h1>
            <p>
              Which tests passed, what the limitations are, and how to reproduce
              the results.
            </p>
          </div>
        </div>
        <div className="evidence-grid">
          <section className="studio-panel evidence-card">
            <div className="eyebrow">BREADBOARD / CONNECTIVITY VALIDATION</div>
            <h2>
              5<span>/5</span>
            </h2>
            <h3>Example circuits matched their schematics.</h3>
            <p>
              830 holes and 134 independent copper groups. Checks cover
              incorrect pins, shorts, disconnected rails, and hole collisions.
              49 automated domain tests, including 16 breadboard tests.
            </p>
            <p>
              2D/3D dragging, attached jumpers, bidirectional highlighting, and
              learning steps were tested in a real browser. Five PDF guides were
              verified as single-page documents.
            </p>
            <div className="evidence-note">
              3D dragging measured 119 FPS on Apple M4 / Metal. Performance
              depends on the device and browser. Matching a schematic does not
              validate analog performance or physical hardware.
            </div>
            <a href="/breadboard">
              Open Breadboard Lab <ArrowUpRight size={14} />
            </a>
            <a href="/reports/breadboard-browser-validation.json" download>
              Browser test report <Download size={14} />
            </a>
            <a href="/reports/breadboard-methods.md" download>
              Methods and limitations <Download size={14} />
            </a>
          </section>

          <section className="studio-panel evidence-card">
            <div className="eyebrow">WOKWI / ESP32 / RASPBERRY PI PICO</div>
            <h2>
              {embedded.compiles.passed}
              <span>/{embedded.compiles.total}</span>
            </h2>
            <h3>New exported examples compiled.</h3>
            <p>
              Checked with Wokwi CLI: {embedded.diagrams.passed}/
              {embedded.diagrams.total} wiring files. LED + potentiometer +
              button + OLED examples on UNO, Nano, Mega, ESP32-DevKitC V4, and
              Pico; individual module compilations for UNO, ESP32, and Pico.
            </p>
            <p>
              Wokwi CLI 0.26.1 · Arduino CLI 1.5.1 · ESP32 3.3.11 · Arduino-Pico
              6.1.0.
            </p>
            <div className="evidence-note">
              These checks cover wiring files and C++ compilation. Wokwi cloud
              execution and physical hardware were not tested. A 5 V HC-SR04
              configuration is blocked on ESP32/Pico.
            </div>
            <a href="/reports/embedded-validation.json" download>
              <Download size={14} />
              New compilation and wiring report
            </a>
          </section>
          <section className="studio-panel evidence-card">
            <div className="eyebrow">ARDUINO / COMPILATION</div>
            <h2>
              {compiles.passed}
              <span>/{compiles.total}</span>
            </h2>
            <h3>Example sketches compiled.</h3>
            <p>
              LED + potentiometer + button on 9 boards. 24 module templates
              compiled individually on UNO R3; BME280 + OLED compiled together.
            </p>
            <p>
              Arduino CLI 1.5.1 · AVR 1.8.8 · megaAVR 1.8.8 · Renesas UNO 1.6.0
              · SAMD 1.8.14.
            </p>
            <div className="evidence-note">
              The Nano ESP32 code profile is not included in this compilation
              matrix. Successful compilation does not establish electrical or
              physical validation of every combination.
            </div>
            <a href="/reports/arduino-compile-results.json" download>
              <Download size={14} /> Compilation report JSON
            </a>
          </section>
          <section className="studio-panel evidence-card">
            <div className="eyebrow">FILTER AI / 10 EXPERIMENTS</div>
            <h2>
              {mean('aiYield').toFixed(1)}
              <span>%</span>
            </h2>
            <h3>Mean independent tolerance yield.</h3>
            <p>
              Random search with the same budget:{' '}
              {mean('randomYield').toFixed(1)}%. Each method receives 64 circuit
              evaluations, with 1,024 new tolerance draws per result.
            </p>
            <p>
              Predeclared seeds 0–9, default targets, one Sallen–Key topology,
              and an ideal op-amp model. AI achieved a better training score in
              7 experiments; random search in 3.
            </p>
            <div className="evidence-note">
              This small experiment does not establish general superiority or
              physical circuit performance. Test results did not influence
              candidate selection.
            </div>
            <a href="/reports/filter-benchmark.json" download>
              <Download size={14} /> Experiment results JSON
            </a>
          </section>
        </div>
        <div className="evidence-grid">
          <section className="studio-panel evidence-card">
            <div className="eyebrow">FINITE OP-AMP / INDEPENDENT NGSPICE</div>
            <h2>{spice.points.toLocaleString('en-US')}</h2>
            <h3>Frequency points compared.</h3>
            <p>
              30 circuits, swept from 1 Hz to 100 MHz. The browser&apos;s
              analytical result was compared with ngspice 47&apos;s independent
              AC solution. Maximum relative difference{' '}
              {spice.maxRelativeError.toExponential(2)}.
            </p>
            <div className="evidence-note">
              A single-pole finite op-amp and one Sallen–Key topology. Numerical
              agreement does not validate saturation, slew rate, parasitics, or
              physical measurements.
            </div>
            <a href="/reports/ngspice-validation.json" download>
              <Download size={14} />
              Comparison report
            </a>
          </section>
          <section className="studio-panel evidence-card">
            <div className="eyebrow">FAULT AI / HELD-OUT TEST</div>
            <h2>{fault.test.top1AccuracyPct}%</h2>
            <h3>Top-scoring class correct.</h3>
            <p>
              A neural network with 24 inputs and 32 hidden units. 800 training,
              200 validation, and 200 separate test circuits; 1,200 synthetic
              test measurements.
            </p>
            <p>
              0 false alarms in 200 healthy measurements; 2 missed faults in
              1,000 faulty measurements. 14 results were marked uncertain.
              Overall accuracy is 97.5% when uncertain predictions count as
              incorrect.
            </p>
            <div className="evidence-note">
              Six individual conditions with a known nominal circuit and input
              response. No performance claim is made for real hardware or
              simultaneous faults. A result of 0/200 does not guarantee zero
              future false alarms.
            </div>
            <a href="/reports/fault-model-report.json" download>
              <Download size={14} />
              Model card and confusion matrix
            </a>
          </section>
        </div>
        <section className="studio-panel evidence-data">
          <div>
            <FlaskConical size={22} />
            <h2>Adaptive-budget AI · 30 comparative experiments</h2>
          </div>
          <p>
            Each method uses 1,536 circuit evaluations. After winners are
            frozen, they receive 1,024 new tolerance draws. Values below show
            mean independent tolerance yield across 10 seeds.
          </p>
          <div className="table-scroll">
            <table className="wiring-table">
              <thead>
                <tr>
                  <th>PASSBAND / STOPBAND</th>
                  <th>ADAPTIVE-BUDGET AI</th>
                  <th>STANDARD GP</th>
                  <th>RANDOM</th>
                </tr>
              </thead>
              <tbody>
                {budget.summary.map((row, i) => (
                  <tr key={row.condition}>
                    <td>
                      {budget.conditions[i].passHz.toLocaleString('en-US')} /{' '}
                      {budget.conditions[i].stopHz.toLocaleString('en-US')} Hz
                    </td>
                    {row.methods.map((m) => (
                      <td key={m.method}>
                        {m.meanYieldPct.toLocaleString('en-US', {
                          maximumFractionDigits: 1,
                        })}
                        %
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            The new method found a higher mean yield at 100 Hz in this
            experiment; standard GP led at 1 kHz and 10 kHz. There is no claim
            of winning every condition or of general superiority. Evaluation
            budgets are equal; wall-clock times are reported separately.
          </p>
          <a href="/reports/budget-benchmark.json" download>
            <Download size={14} />
            All conditions, candidates, and results
          </a>
          <a className="source-link" href="/lab">
            Run the experiment <ArrowUpRight size={14} />
          </a>
        </section>
        <section className="studio-panel evidence-data">
          <div>
            <FlaskConical size={22} />
            <h2>External dataset audit</h2>
          </div>
          <p>
            121,006 training and 15,948 validation samples across 10 topologies.
            The raw package was not connected to model training.
          </p>
          <div className="evidence-findings">
            <article>
              <strong>114</strong>
              <p>
                validation rows share circuit designs with the training set.
                Splits must be grouped by circuit.
              </p>
            </article>
            <article>
              <strong>~75%</strong>
              <p>
                samples have no tolerance label. Missing values cannot be
                treated as zero loss.
              </p>
            </article>
            <article>
              <strong>1,821</strong>
              <p>
                samples fit the current topology and R/C limits. This is not a
                count of correct labels or successful designs.
              </p>
            </article>
          </div>
          <p>
            The latest work log revealed a model difference: the data generator
            uses finite op-amp bandwidth. Filter AI uses an ideal model; the AI
            Laboratory also provides an independent finite model. Two previously
            discrepant examples meet the stopband limit in an independent
            calculation with the described finite model. The earlier ideal-model
            comparison should not be interpreted as evidence of incorrect
            labels.
          </p>
          <a href="/reports/data-audit.md" download>
            Download the data audit <ArrowUpRight size={14} />
          </a>
        </section>
        <section className="studio-panel evidence-data">
          <div>
            <FlaskConical size={22} />
            <h2>Development log · Claude project review</h2>
          </div>
          <p>
            The latest conversation and shared work log were reviewed. They
            record expansion to 13 topologies, temperature and cost models,
            KiCad netlist/BOM export, and 41 passing tests. These records are
            kept separate from this site&apos;s validation results.
          </p>
          <div className="evidence-findings">
            <article>
              <strong>100 dB / 10 MHz</strong>
              <p>Op-amp open-loop gain and GBW stated in the source log.</p>
            </article>
            <article>
              <strong>Source code</strong>
              <p>
                The current engine archive has not been received; 13 topologies
                are not enabled on this site.
              </p>
            </article>
            <article>
              <strong>320 / 520</strong>
              <p>
                Last observed progress of the new data generation. No completed
                new dataset or training result was available.
              </p>
            </article>
          </div>
          <p>
            Integration order: compare both engines on the same circuit, align
            topology and data versions, then connect the new model with
            independent tests. The review also records a mislabeled fallback in
            the generalization experiment and a simulator error-threshold
            discrepancy.
          </p>
          <a href="/reports/claude-review.md" download>
            Download the project review <ArrowUpRight size={14} />
          </a>
        </section>
        <section className="studio-panel evidence-table">
          <div className="panel-heading">
            <CheckCircle2 size={18} />
            <h2>Compilation matrix</h2>
            <span className="mono-count">Hardware testing: not performed</span>
          </div>
          <div className="table-scroll">
            <table className="wiring-table">
              <thead>
                <tr>
                  <th>BOARD / EXAMPLE</th>
                  <th>TARGET (FQBN)</th>
                  <th>RESULT</th>
                </tr>
              </thead>
              <tbody>
                {compiles.cases.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name.replaceAll('_', ' ')}</td>
                    <td>
                      <code>{c.fqbn}</code>
                    </td>
                    <td>
                      <span className="support-chip supported">Passed</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <footer className="studio-footer">
          <span>Research prototype developed with AI assistance</span>
          <a href="/filter">
            Open Filter AI <ArrowUpRight size={13} />
          </a>
          <a href="/reports/lab-methods.md" download>
            Laboratory methods <Download size={13} />
          </a>
          <a href="/">
            Arduino Studio <ArrowUpRight size={13} />
          </a>
        </footer>
      </main>
    </div>
  );
}
