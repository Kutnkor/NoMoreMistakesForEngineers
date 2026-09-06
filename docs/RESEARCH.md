# Research and reproduction

This repository contains a working engineering prototype and recorded experiments. The interface and downloadable research notes are available in English. This document provides a research entry point. The implementation was developed with AI assistance.

## 1. Tolerance-aware filter optimization

**Question:** At an equal number of evaluated candidate designs, can a Gaussian-process search find better tolerance-aware Sallen–Key low-pass filters than random search?

The ideal unity-gain model is:

```text
H(s) = 1 / [1 + s C2 (R1 + R2) + s² R1 R2 C1 C2]
```

R1 connects the input to node a; R2 connects a to b; C1 connects a to the output; C2 connects b to ground. The ideal buffer enforces output = b. Candidate resistors and capacitors are rounded to E24 values before evaluation.

The search uses 48 fixed training tolerance draws, independent uniform R/C deviations, an identical eight-design initialization and equal candidate budgets. The GP uses a Matérn 5/2 kernel and expected improvement. Winners selected by training score receive 1,024 independent held-out tolerance draws. The report includes Wilson confidence intervals; it does not claim a guaranteed worst-case tolerance bound.

```sh
pnpm benchmark
```

This regenerates `research/benchmark.json` for ten predeclared seeds. Preserve the original report before replacing it if comparing implementations. See [the implementation](../lib/optimizer.ts), [independent circuit tests](../tests/circuit.test.ts), and [full Turkish methods](../README.tr.md).

## 2. Finite op-amp validation

**Question:** How does a finite, single-pole op-amp model change the apparent feasibility of a design that passes ideal-model checks?

The model includes finite open-loop gain and gain-bandwidth product. It is evaluated in the browser as a numerical AC response, and has been compared with a native ngspice 47 process on 30 designs and 401 frequency samples per design. The recorded comparison is [ngspice-validation.json](../research/ngspice-validation.json).

To repeat the reference comparison, install ngspice separately, then pass the absolute path of its executable:

```sh
node scripts/validate-ngspice.ts /absolute/path/to/ngspice work/ngspice-validation
```

This is a separate validation step; ngspice is not required to run the web application. Saturation, slew rate, noise, parasitics and temperature dependence are outside the included model.

## 3. Synthetic fault classifier

**Question:** Can a small neural network distinguish six defined circuit conditions from noisy residual AC-response features?

The included model maps 24 features through 32 tanh hidden units to six softmax scores. Classes are healthy, C1 drift, C2 drift, C1 open, R1 open and R2 short. Training uses 9,600 synthetic examples, validation 1,200 and testing 1,200. Nominal circuit groups are disjoint across these splits. Validation loss selects the epoch; the frozen model is then evaluated on the test set.

The recorded top-1 accuracy is 98%; counting uncertain outcomes as incorrect yields 97.5%. Scores are not calibrated probabilities. These are single-fault synthetic results, with a known nominal circuit and excitation—not physical-hardware diagnostic accuracy.

The trained model is `public/models/fault-mlp.json`; its report, hashes, split sizes and confusion matrix are in [fault-model-report.json](../research/fault-model-report.json). To reproduce training, use Python 3 with NumPy in a separate environment:

```sh
node scripts/generate-fault-data.ts work/fault-training
python3 -m venv work/python-env
# Activate the environment using your platform's standard command, then:
python -m pip install numpy
python scripts/train-fault-model.py work/fault-training/fault-data.json work/retrained-model
```

Generated data and retrained artifacts stay outside tracked files. They do not replace the model shipped in the application automatically. Numerical libraries and runtime versions can affect floating-point reproducibility; record them with a new report.

## 4. Learning to allocate a simulation budget

**Question:** Does choosing where to spend detailed tolerance analysis improve held-out yield at the same number of AC realization evaluations?

The recorded benchmark compares adaptive allocation, standard GP search and random search across three conditions and ten predeclared seeds per condition. Each method receives 1,536 AC realization evaluations. Frozen winners receive a separate 1,024-draw held-out audit, outside search cost. Wall-clock overhead is recorded but is not equalized.

```sh
node scripts/benchmark-budget.ts work/budget-benchmark.json
```

Results are mixed: the standard GP has the higher mean held-out yield in two conditions, and the adaptive method in one. See [raw results](../research/budget-benchmark.json) and [laboratory methods](../research/LAB_METHODS.md). This does not establish general superiority.

## 5. Embedded exports and breadboard connectivity

[Embedded validation](../research/embedded-validation.json) records 53 Wokwi diagram checks and 33 additional Arduino CLI compilations. [The earlier compilation matrix](../research/arduino-compile-results.json) is retained separately. A compiler or diagram validator does not prove cloud simulation behavior, correct real wiring or physical-hardware performance.

The breadboard uses 830 holes and a physical connectivity graph with split power rails. Union-find extraction is independent of intended net labels. Five presets are checked against this physical connectivity, including negative cases for wrong connections, open rails, shorts, collisions and invalid DIP footprints. See [breadboard methods](../research/BREADBOARD_METHODS.md).

The default `pnpm check` runs 49 domain tests plus one standalone preview-server regression, type checking, linting, a production build and tests of the emitted workers. Lint excludes the vendored `components/ui/` layer; TypeScript still covers it. Optional browser testing uses a separately installed Playwright package and Chromium:

```sh
# In a second terminal after pnpm build && pnpm start:
BASE_URL=http://127.0.0.1:4173 PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
  node tests/breadboard-browser.mjs work/browser-validation
```

The browser test uses an isolated test profile and only controls localhost. `CF_TEST_GPU=1` enables the host GPU option; on macOS it requests Metal. The historical 119 FPS observation is specific to the recorded Apple M4/Metal setup, not a cross-device guarantee. The test also writes assembly PDFs; page counts can be checked independently with a PDF parser.

## External data and historical work

[The external-data audit](../research/data-audit.md) describes supplied NPZ/CSV data; these raw files are not distributed here. They were not used to train the included fault model. [The historical external-project review](../research/claude-review.md) records additional work seen in another project. Its 13-topology, KiCad, cost and thermal claims are not implemented features of this repository unless separately documented and tested here.

For a research presentation, distinguish your problem formulation, implementation changes, experimental decisions, independently reproduced results, and use of AI assistance. Keep failed experiments and limitations alongside successful outcomes.

## GitHub preparation check

The standalone export was checked separately from the hosted application. See [preparation results](../research/github-preparation.json) and [production-preview browser results](../research/github-browser-validation.json). GitHub Actions is configured but has not run until the repository is created and pushed.
