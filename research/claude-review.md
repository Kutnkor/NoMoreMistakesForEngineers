# Claude work-log review — 2026-09-05

**Conclusion:** The text shows new test and experiment code, but not a completed new dataset, a retrained 13-topology model, or repeated performance benchmarks. The key new information is the **finite op-amp model**, under which earlier ideal-model counterexamples can meet their targets. The earlier dataset conclusion remains “not directly compatible with the current ideal engine,” not “Claude's labels are wrong.”

Sources: the complete user-supplied `pasted-text.txt` work log, the previous data audit, and the existing `lib/circuit.ts`. Commands in the log were not executed. Numerical comparisons used an independently derived closed-form expression; Claude's source code was not independently run.

## How the new information changes the earlier audit

Lines 851–852 of the log describe the normal op-amp as a single-pole model with **A₀=100 dB=100,000, GBW=10 MHz**. Analytical tests explicitly switch to A₀=10¹², GBW=10¹⁵ (line 376). The ideal equation in `test_sallen_key_lowpass` is **the same** as the current TypeScript equation, pointing to a physical-model difference rather than a capacitor-name swap.

For a standard unity-gain Sallen–Key, let `A(s)=A₀/(1+s/ωp)`, `ωp=2π·GBW/A₀`, and `G(s)=A(s)/(1+A(s))`. The node equations give:

`H(s)=G(s)/[1+s·C2·(R1+R2)+s²·R1·R2·C1·C2+s·R1·C1·(1−G(s))]`.

Using this **assumed derivation consistent with the stated model**, the earlier examples were recalculated at their stopband edges:

| Earlier audit example | Ideal absolute attenuation | Finite absolute attenuation | Finite relative attenuation | Required |
|---|---:|---:|---:|---:|
| CSV data row 1043 | 9.8231 dB | 18.5044 dB | 20.0244 dB | 16.84 dB |
| Training NPZ row 10674 | −0.1695 dB | 11.7010 dB | 12.7888 dB | 11.2582 dB |

**The stopband violations in these examples disappear under the finite model.** Full-band margins still need to be rerun using the actual `mna.py`, netlist, and `FilterSpec`; two calculations do not validate all labels. The earlier 448/18,075 figure measures disagreement only under the stated ideal model and band interpretation. The 114 overlapping validation-circuit rows, missing MC labels, and undocumented U manifest are unaffected.

## What the log shows and does not show

| Area | Observed evidence | Limitation |
|---|---|---|
| 13 topologies | Additional HP/BP work records, an image named `sk_hp4`, and a 13-topology claim; the test count is consistent with that parameter count | No current topology registry/netlists or full names of all three additions |
| MNA / ngspice | Comparison test code and six analytical example tests | No solver sources, independent execution, or maximum-error output |
| 41 tests | `41 passed in 15.40s` at the end of the log, with an earlier temperature-test failure explicitly shown | Not verified in this environment; the temperature fix's code diff is not shown |
| New data | 13-topology generation started; last output **320/520 chunks** | No completion output, new shapes, hashes, split report, or files |
| AI / benchmark | `run_benchmark.py`, `generalization.py`, and training masks for sensitivity labels | No new experiment results/checkpoint; no raw results or accounting scope for 217/958/2098 |
| Cost / temperature | Module names, tests, README assumptions, and part of a UI | No module implementations, price lists, or temperature curves |
| Schematic / KiCad / Flask | Work records and screenshot filenames | No project archive, circuit file, or manufacturing package opened in this review |

## Priority corrections and validation

**1. Establish the model and data contract first.** Obtain `topologies.py`, `mna.py`, `spice.py`, `specs.py`, `datafactory.py`, `tolerance.py`, and model/data version manifests. Since ideal and finite engines can differ on the same example, carry engine identity, A₀/GBW, source/load conditions, pass/stop edges, and gain reference with API responses and reports. Prevent silent use of an old 10-topology checkpoint with a new 13-entry registry. Do not assume the old NPZ files changed because new generation was started or completed; recheck group splits, U ordering, and MC definitions in the new files.

**2. Narrow the simulator agreement claim.** The shown ngspice test uses a **1e−3 dB** threshold (line 356), while the README claims **1e−6 dB maximum difference**. Passing the test does not establish the latter. Two solvers sharing one topology definition can share a wiring/model error. Six analytical tests are a useful third check, not proof of physical correctness for all 13 topologies. Report the limited scope: 30 designs per topology, 10 Hz–1 MHz, and responses above −150 dB. `mask=(m>-150)&(res.db>-150)` can hide NaNs and large one-sided deep-attenuation discrepancies; first verify finiteness and coverage of every circuit. `hash(name)` is not stable across processes; use fixed IDs/seeds. [Python hash behavior](https://docs.python.org/3/reference/datamodel.html#object.__hash__)

**3. The label test conflicts with an “error-free” claim.** `test_reverse_labels_are_valid` checks only the first 25 accepted examples per topology and **allows fewer than 2% invalid labels** (lines 523–543). It does not establish 99.75% accuracy or zero label noise. Checks using the same MNA and finite frequency grid can also miss narrow resonances or band edges. Add independent ngspice checks under the same physical model, complete band-edge checks, and adaptive sweeps where necessary.

**4. Generalization experiment B is currently mislabeled.** `oracle_topo.order==4` does not establish that a second-order solution is impossible; it only means the oracle found a fourth-order solution. More directly, an empty list falls back to `hard=hi_specs` while still reporting “specifications requiring fourth order” (lines 298–306). Remove the fallback and report an empty test explicitly. Failure of a fixed network with untrained class heads alone is not evidence of memorization; separate topology composition/representation from NNAgent's search contribution. Fixed 10 MHz GBW and component bounds break scale invariance in the frequency experiment, while unequal sample counts for low-frequency and full-data models introduce another effect. Use equal-size controls, normalized scale tests, and training-only preprocessing.

**5. Use consistent performance accounting and independent evaluation.** Only successful runs contribute to the `sims_to_ok` median (lines 248–251). Label it “median among successful runs” and report failures and success rate alongside it. Filtering specifications the oracle cannot solve does not establish physical impossibility; state benchmark selection bias. Count nominal calls, all MC calls, warm-start, training cost, and final evaluation consistently. Do not repeat superiority claims based on 217/958/2098 without raw runs, seeds, budgets, and a success definition.

**6. Monte Carlo, temperature, and 99% yield are different concepts.** The generalization evaluation uses `n_mc=32`. A result of 32/32 gives only a **91.06%** one-sided 95% exact-binomial lower confidence bound. Establishing a 99% lower bound requires at least **299/299** independent successes for a fixed design. Testing must be separate from design selection. `p05≥0` does not define a 99% target. “Yield must decrease as tolerance increases” and “p05 can never exceed nominal” are not universal physical laws; a poor nominal circuit can improve under some perturbations. A thermal worst case is guaranteed no better than its reference only when taking a minimum over **the same generated samples** and a temperature set containing the reference. The first shown temperature test compares different MC draws; changing only a seed until it passes is not model validation.

X7R's ±15% specification is a temperature-class limit under defined test conditions, not a linear drift or probability distribution. Actual parts, DC bias, and operating conditions can change the result. Do not claim automotive suitability across the temperature range without manufacturer curves. [Murata temperature and DC-bias explanation](https://www.murata.com/en-global/support/faqs/capacitor/ceramiccapacitor/char/0058)

**7. Give cost and manufacturing outputs their correct scope.** README prices are described as typical early-2026 values at roughly 1,000-unit quantities; no evidence of Digi-Key pricing was supplied. The $0.40 saving is an illustrative suggestion, not a measured result. Tie unit prices to SKU, tolerance, package, quantity, currency, and date. `(BOM+test)/yield` already includes basic costs of unsuccessful attempts; add “scrap” only for separate disposal/rework costs using the correct denominator. The UI rule `yield<0.5 → cannot be manufactured` is an arbitrary physical claim; label it “below the yield target.”

A schematic+BOM+KiCad netlist is not an order-ready PCB. Placement/routing, footprints/actual parts, power connections, checks, and fabrication/assembly outputs are still required. Until that package is available, describe this as schematic/netlist export. [KiCad manufacturing outputs](https://docs.kicad.org/9.0/en/pcbnew/pcbnew.html)

## Integration order

1. Review the source archive and manifest; preserve the ideal/finite model distinction in the API and visible result labels.
2. First align both engines on identical `sk_lp2` examples, then add the 13 topologies with their own netlist tests.
3. Verify the new data, grouped splits, and model dimensions; correct the generalization fallback and metric definitions.
4. Add cost/temperature as a research layer with explicit assumptions. Avoid stronger claims until validated benchmarks and actual manufacturing files are available.

The log does not establish that the archive was completed, the 13-topology network was trained, generalization experiments finished, live supplier prices were fetched, or a PCB is order-ready.

## Latest state observed in Claude desktop

The electronics-optimization conversation in the **CIRCUIT FORGE** project was also opened directly. Its latest task list includes topology, cost, temperature, benchmarks, KiCad, Flask, interface, and tests. The final data-generation wait was interrupted, with no visible completion record. Outputs list only the previously reviewed data card, CSV, training NPZ, and validation NPZ. The current engine source archive was not received, so integration of the 13 topologies, cost/temperature engines, and KiCad manufacturing outputs into this site is not claimed.

At that stage, the site was updated with real photographs of 45 boards and 46 physical components, a photo-based wiring workspace, and a refreshed interface. Earlier Arduino and ideal Sallen–Key validation results were retained separately.

The independent two-example calculation can be reproduced with `scripts/finite-model-comparison.py` (Python + NumPy). Full inputs, assumptions, and SHA-256 hashes are in `research/finite-model-comparison.json`; a web copy is available in the [calculation record](finite-model-comparison.json). This diagnostic calculation does not itself change the site engine.
