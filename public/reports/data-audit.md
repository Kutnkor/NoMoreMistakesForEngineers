# CIRCUIT FORGE data audit — 2026-09-05

**Updated conclusion:** The package is a useful starting point for research. Direct integration requires aligning the model and data contract with the generating engine. The numerical files are intact. The latest Claude work log indicates finite op-amp bandwidth in the generator, so differences from this site's ideal model are not evidence of incorrect labels. Missing generation definitions and a small training–validation circuit overlap remain valid findings. No model was trained during this audit, and raw data was not connected to the application. NPZ files were read with `allow_pickle=False`; supplied code/commands were not executed.

## Model correction following the latest Claude work

On September 5, 2026, the CIRCUIT FORGE electronics-optimization conversation in Claude desktop and the shared work log were reviewed. The log specifies a single-pole normal op-amp with **A₀=100 dB (100,000), GBW=10 MHz**; analytical comparison tests use different, near-ideal settings.

An independently derived model consistent with that description uses `G(s)=A(s)/(1+A(s))`, `A(s)=A₀/(1+s/ωp)`, and `ωp=2π·GBW/A₀`:

`H(s)=G(s)/[1+s·C2·(R1+R2)+s²·R1·R2·C1·C2+s·R1·C1·(1−G(s))]`.

CSV row 1043 has 9.8231 dB absolute attenuation at the stopband edge under the ideal model, but approximately **18.5044 dB** under this finite model, meeting its 16.84 dB target. Training row 10674 similarly gives approximately **11.7010 dB**, instead of the ideal model's −0.1695 dB, meeting the 11.2582 dB limit. These are independent diagnostic calculations based on the described model; Claude's source code was not executed. Full-band margins and all data labels still require separate validation.

**The 448/18,075 figure below measures disagreement under the ideal model and stated band assumptions; it is not a count of verified incorrect labels.** Earlier numerical results are retained as a comparison record. Circuit overlap, missing MC labels, and the undocumented U manifest are unaffected by the model difference. See `claude-review.md` for the latest review and integration assessment.

## Observed schema

| File | Rows | Arrays |
|---|---:|---|
| `cf_train.npz` | 121,006 | The same 12 arrays listed below |
| `cf_val.npz` | 15,948 | The same 12 arrays listed below |
| `cf_veri_ornegi.csv` | 3,000 | 26 columns; physical components and Turkish feature names in the original source |

NPZ arrays: `fc`, `gain`, `ripple`, `stop_ratio`, `stop_db`, `bw`, `margin`, `p05_drop`, and `has_mc`: `(N,) float32`; `U`: `(N,10) float32`; `topo_id` and `kind_id`: `(N,) int16`. The NPZ files contain no physical R/C/L values, topology names, or decoding manifest. `U` holds normalized component targets in topology-dependent order.

**All 3,000 CSV rows** match the training NPZ within CSV rounding tolerances; none match validation. The CSV is not a separate test set. The following transformation was verified against matching physical components but was not documented in the package:

- Resistance: `R = 10^(2 + 4u)` Ω; domain 100 Ω–1 MΩ.
- Capacitance: `C = 10^(-10 + 5u)` F; domain 100 pF–10 µF.
- Inductance: `L = 10^(-6 + 5u)` H; domain 1 µH–100 mH.

Topology mapping: `0 sk_lp2`, `1 sk_hp2`, `2 mfb_lp2`, `3 mfb_bp2`, `4 rc_lp2`, `5 rlc_lp2`, `6 sk_lp4`, `7 sk_lp2g`, `8 sk_hp2g`, `9 sk_lp4g`. Kinds: `0 lowpass`, `1 highpass`, `2 bandpass`. Full U-column order and numerical transformation errors are recorded in `data-audit.json`. The maximum matching residual is approximately 1.7×10⁻⁷ log10 units; all decoded components match E24 values within 1 ppm.

**Masking:** Unused U columns are zero, but the minimum active component value also encodes as zero: 4,006 active zeros in total. Construct masks from the topology's column schema, not from `U != 0`. Both NPZ files are ordered in topology blocks and should be shuffled during training.

## Numerical integrity and data separation

- No NaN/infinite values occur outside `p05_drop`; all U values are in [0,1].
- Training has 30,219 Monte Carlo labels and validation has 3,978. The remaining approximately 75% are NaN; `has_mc` matches missingness exactly. Do not fill missing labels with zero; mask the corresponding loss.
- There are no exact full-row or full-input-feature duplicates across the two sets.
- **113 distinct topology+component vectors occur in both sets. 114 validation rows (0.715%) use circuits seen in training:** 112 RLC and 2 high-pass Sallen–Key. Training has 435 extra within-set circuit duplicates; validation has 14. Keep each physical circuit group within one split. This overlap was not found in the current `sk_lp2` subset.
- Each set contains only 176 distinct `fc` values and 11 distinct `stop_ratio` values. Random row splitting does not establish generalization to new frequency regions.

## Comparison with the current simulator

The reviewed `lib/circuit.ts` model is:

`H(s) = 1 / [1 + s·C2·(R1+R2) + s²·R1·R2·C1·C2]`.

The application uses a unity-gain, second-order Sallen–Key low-pass filter. Only the **18,075** rows with `topo_id=0` belong to this family. Of those, **1,821** fit the application's R=1–100 kΩ, C=1–100 nF bounds. The other nine topologies cannot be evaluated with the same formula. The application targets 0 dB gain and absolute stopband attenuation; the package has variable target gain and an unconfirmed attenuation definition.

**Direct CSV ideal-model discrepancy, based on physical values rather than U decoding:** CSV data row 1043 (zero-based; file line 1045), `sk_lp2`: R1=6,200 Ω, R2=110 Ω, C1=110 nF, C2=110 pF; fc=19,952.62 Hz; ratio=5.595; target gain=1.52 dB; required attenuation=16.84 dB; reported guaranteed margin **+1.962 dB**. The stopband edge is 111,634.9089 Hz. The current formula gives **9.8231 dB absolute attenuation**, or **11.3431 dB relative attenuation** against target gain. Neither interpretation meets the target; relative margin is **−5.4969 dB**. CSV rounding does not explain the difference.

Analytical band edges/extrema were checked across all 18,075 rows, assuming `fc` is the passband upper limit, passband target is `gain ± ripple`, and the stopband begins at `fc × stop_ratio`. Even with the more favorable relative-attenuation interpretation, **448 rows (2.479%; 405 training, 43 validation)** violate a limit by more than 0.01 dB. Of these, 447 also fail at the stopband edge directly. Under absolute attenuation there are 2,109 violations. These counts depend on the ideal op-amp model and stated band definitions; without the original `FilterSpec`, the generator's exact calculation cannot be established.

The data card's “−3 dB cutoff frequency” description also disagrees with the current formula: none of the 18,075 `fc` values is within 1% of its calculated −3 dB frequency; median `fc/f₋₃dB` is 0.643. It is more likely that this field represents a passband edge; this is an inference. Swapping C1/C2 names greatly worsens agreement, so a simple capacitor-name swap does not resolve the issue. **The evidence establishes incompatibility between the current application and the labels, not that the generator's circuit equation is definitely wrong without its netlist.**

## Requirements before training

1. Record generator source/version, the 10 netlists, topology/U manifest, exact pass/stop ranges, and attenuation reference. This audit did not find them reproducibly documented in the package.
2. First align the original finite op-amp model and band definitions for `sk_lp2`; recalculate labels under the same physical model and independently evaluate them with SPICE. If an ideal-engine dataset is created, regenerate labels for that model. Inverse labeling does not guarantee valid labels when the simulator or band metric is wrong. The data card itself reports 0.25% invalid outcomes among 400 examples, which also conflicts with a “noise-free labels” claim.
3. Obtain Monte Carlo tolerance percentages, distribution, correlations, draw count/seed, and the `p05_drop` definition. Without these, the robustness target cannot be reproduced or equated with the application's default 1% R / 5% C tolerances.
4. Create new splits grouped by physical circuit and separate frequency/specification tests. A design generator should receive only requested specifications; solution-derived `margin`/`p05_drop` must not be inputs. Robustness prediction should instead receive topology+components+specifications+tolerance definitions, with loss calculated only on labeled rows.

The package does not provide optimal designs, physical measurements, or a ready trained AI. After validation, it could support initial design prediction and separate robustness research. Counts, file SHA-256 hashes, examples, and the inferred schema are in `data-audit.json`.
