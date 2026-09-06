#!/usr/bin/env python3
"""Independent, conditional diagnostic for two CIRCUIT FORGE data rows.

Reads inert CSV/NPZ inputs; never imports or executes Claude project code.
Only stop-edge compatibility is classified. This is neither a reproduction of
Claude's source nor a full-band, tolerance, stability, or hardware validation.

Run from any directory:
    python3 scripts/finite-model-comparison.py --pasted-text /path/to/pasted-text.txt

--pasted-text is required; --downloads-dir, --site-model and --out replace defaults.
The output contains full selected rows, model assumptions and SHA-256 hashes.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import platform
from pathlib import Path

import numpy as np


WORK = Path(__file__).resolve().parent
PROJECT = WORK.parent
A0 = 100_000.0
GBW_HZ = 10_000_000.0
E24 = (1, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2, 2.2, 2.4, 2.7, 3,
       3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1, 10)


def artifact(path: Path, role: str) -> dict:
    payload = path.read_bytes()
    return {"role": role, "file": path.name, "bytes": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest()}


def snap_e24(value: float) -> float:
    decade = 10.0 ** math.floor(math.log10(value))
    mantissa = min(E24, key=lambda x: abs(math.log((decade * x) / value)))
    # Remove representation noise from decade * mantissa, not physical precision.
    return float(format(decade * mantissa, ".12g"))


def ideal_transfer(parts: dict, frequency_hz: float) -> complex:
    s = 2j * math.pi * frequency_hz
    r1, r2, c1, c2 = (parts[k] for k in ("r1Ohm", "r2Ohm", "c1F", "c2F"))
    d0 = 1 + s * c2 * (r1 + r2) + s * s * r1 * r2 * c1 * c2
    return 1 / d0


def finite_transfer(parts: dict, frequency_hz: float) -> complex:
    """Algebraic polynomial form, avoiding cancellation in 1-G near DC."""
    s = 2j * math.pi * frequency_hz
    r1, r2, c1, c2 = (parts[k] for k in ("r1Ohm", "r2Ohm", "c1F", "c2F"))
    wp = 2 * math.pi * GBW_HZ / A0
    d0 = 1 + s * c2 * (r1 + r2) + s * s * r1 * r2 * c1 * c2
    return A0 / ((A0 + 1 + s / wp) * d0 + s * r1 * c1 * (1 + s / wp))


def follower_form_transfer(parts: dict, frequency_hz: float) -> complex:
    """Equivalent nodal form used only to expose a numerical consistency check."""
    s = 2j * math.pi * frequency_hz
    r1, r2, c1, c2 = (parts[k] for k in ("r1Ohm", "r2Ohm", "c1F", "c2F"))
    wp = 2 * math.pi * GBW_HZ / A0
    a = A0 / (1 + s / wp)
    g = a / (1 + a)
    d0 = 1 + s * c2 * (r1 + r2) + s * s * r1 * r2 * c1 * c2
    return g / (d0 + s * r1 * c1 * (1 - g))


def gain_db(h: complex) -> float:
    return 20 * math.log10(abs(h))


def evaluate(case: dict) -> dict:
    parts, spec = case["partsSIUsed"], case["specValues"]
    frequencies = {"dc": 0.0, "passEdgeAssumption": spec["fcHz"],
                   "stopEdgeAssumption": spec["fcHz"] * spec["stopRatio"]}
    results = {}
    for name, transfer in (("ideal", ideal_transfer), ("onePoleConditional", finite_transfer)):
        points = {}
        for label, hz in frequencies.items():
            h = transfer(parts, hz)
            db = gain_db(h)
            points[label] = {"frequencyHz": hz, "transferReal": h.real,
                             "transferImag": h.imag, "magnitude": abs(h), "gainDb": db}
        stop_gain = points["stopEdgeAssumption"]["gainDb"]
        absolute = -stop_gain
        relative = spec["targetGainDb"] - stop_gain
        results[name] = {"points": points,
                         "absoluteStopAttenuationDb": absolute,
                         "relativeStopAttenuationDb": relative,
                         "absoluteStopEdgeMarginDb": absolute - spec["requiredStopDb"],
                         "relativeStopEdgeMarginDb": relative - spec["requiredStopDb"],
                         "stopEdgePassAbsolute": absolute >= spec["requiredStopDb"],
                         "stopEdgePassRelative": relative >= spec["requiredStopDb"]}
    consistency = max(abs(finite_transfer(parts, f) - follower_form_transfer(parts, f))
                      / max(abs(finite_transfer(parts, f)), 1e-300)
                      for f in frequencies.values())
    if consistency > 1e-10:
        raise ArithmeticError("Equivalent finite-model formulas disagree numerically")
    case["results"] = results
    case["finiteFormulaConsistencyMaxRelativeError"] = consistency
    case["classificationScope"] = "Only the stated stop-edge frequency; not full-spec feasibility."
    return case


def read_csv_case(path: Path) -> dict:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    row = rows[1043]
    if (row["topoloji"], row["filtre_tipi"]) != ("sk_lp2", "lowpass"):
        raise ValueError("CSV row 1043 no longer identifies sk_lp2 / lowpass")
    return {"caseId": "csv-data-row-1043", "sourceArtifact": path.name,
            "dataRowIndex0": 1043, "csvFileLine1": 1045, "rawInputRow": row,
            "partsSIUsed": {"r1Ohm": float(row["R1"]), "r2Ohm": float(row["R2"]),
                            "c1F": float(row["C1"]), "c2F": float(row["C2"])},
            "componentDecoding": "Direct physical component values from CSV; no U inference.",
            "specValues": {"fcHz": float(row["fc_Hz"]),
                           "targetGainDb": float(row["kazanc_dB"]),
                           "rippleDb": float(row["gecirme_dalgalanma_dB"]),
                           "stopRatio": float(row["durdurma_orani"]),
                           "requiredStopDb": float(row["durdurma_bastirma_dB"]),
                           "bandwidthRatio": float(row["bant_genisligi_orani"]),
                           "declaredMarginDb": float(row["garanti_marj_dB"]),
                           "declaredToleranceDropDb": float(row["tolerans_kaybi_dB"])}}


def read_npz_case(path: Path) -> dict:
    with np.load(path, allow_pickle=False) as archive:
        row = {key: archive[key][10674].tolist() for key in archive.files}
        shapes = {key: {"shape": list(archive[key].shape), "dtype": str(archive[key].dtype)}
                  for key in archive.files}
    if (row["topo_id"], row["kind_id"]) != (0, 0):
        raise ValueError("NPZ row 10674 no longer identifies topo_id=0 / kind_id=0")
    nonfinite = {key: "NaN" for key, value in row.items()
                 if isinstance(value, float) and math.isnan(value)}
    for key in nonfinite:
        row[key] = None
    u = row["U"]
    decoded = {"r1Ohm": 10 ** (2 + 4 * u[0]), "r2Ohm": 10 ** (2 + 4 * u[1]),
               "c1F": 10 ** (-10 + 5 * u[2]), "c2F": 10 ** (-10 + 5 * u[3])}
    snapped = {key: snap_e24(value) for key, value in decoded.items()}
    max_snap_error = max(abs(decoded[k] / snapped[k] - 1) for k in decoded)
    if max_snap_error > 1e-6:
        raise ValueError("Decoded values no longer agree with E24 within 1 ppm")
    return {"caseId": "npz-train-row-10674", "sourceArtifact": path.name,
            "dataRowIndex0": 10674, "rawInputRow": row, "npzSchema": shapes,
            "nonFiniteInputValuesEncodedAsNull": nonfinite,
            "componentDecoding": {
                "status": "Inferred in earlier audit from 3000 matched CSV/training rows; no generator manifest supplied.",
                "mapping": {"U0": "R1=10^(2+4u) ohm", "U1": "R2=10^(2+4u) ohm",
                            "U2": "C1=10^(-10+5u) F", "U3": "C2=10^(-10+5u) F"},
                "rawDecodedSI": decoded, "rounding": "Nearest E24 to remove float32 encoding noise only.",
                "maxRelativeDecodeToE24Difference": max_snap_error},
            "partsSIUsed": snapped,
            "specValues": {"fcHz": row["fc"], "targetGainDb": row["gain"],
                           "rippleDb": row["ripple"], "stopRatio": row["stop_ratio"],
                           "requiredStopDb": row["stop_db"], "bandwidthRatio": row["bw"],
                           "declaredMarginDb": row["margin"],
                           "declaredToleranceDropDb": row["p05_drop"]}}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--downloads-dir", type=Path, default=Path.home() / 'Downloads')
    parser.add_argument("--pasted-text", type=Path,
                        required=True)
    parser.add_argument("--site-model", type=Path, default=PROJECT / 'lib/circuit.ts')
    parser.add_argument("--out", type=Path, default=PROJECT / 'research/finite-model-comparison.json')
    args = parser.parse_args()
    csv_path, npz_path = (args.downloads_dir / f for f in ('cf_veri_ornegi.csv', 'cf_train.npz'))
    cases = [evaluate(read_csv_case(csv_path)), evaluate(read_npz_case(npz_path))]
    output = {
        "diagnosticVersion": "1.0.0", "auditDate": "2026-09-05",
        "status": "Conditional independent algebraic diagnostic, not reproduction of Claude source.",
        "runtime": {"python": platform.python_version(), "numpy": np.__version__},
        "artifacts": [artifact(csv_path, 'Selected physical-value example'),
                      artifact(npz_path, 'Selected normalized-value example'),
                      artifact(args.pasted_text, 'Supplied statement of finite op-amp assumptions'),
                      artifact(args.site_model, 'Existing ideal-model reference; read/hash only'),
                      artifact(Path(__file__), 'Independent diagnostic source')],
        "model": {
            "topologyAssumption": "R1: input→x; R2: x→y; C1: x→output; C2: y→ground; op-amp follower input y.",
            "a0Db": 100.0, "a0Linear": A0, "gainBandwidthHz": GBW_HZ,
            "openLoopPoleHz": GBW_HZ / A0,
            "idealTransfer": "H=1/D0; D0=1+s*C2*(R1+R2)+s^2*R1*R2*C1*C2",
            "onePoleTransfer": "H=G/[D0+s*R1*C1*(1-G)]; A=A0/(1+s/wp); G=A/(1+A); wp=2*pi*GBW/A0",
            "evaluatedEquivalentFormula": "H=A0/[(A0+1+s/wp)*D0+s*R1*C1*(1+s/wp)]",
            "assumptionProvenance": "pasted-text.txt lines 383–388 state the ideal topology; 851–852 state one-pole A0/GBW. Actual MNA/netlist implementation was not supplied to this diagnostic.",
            "exclusions": ["Real op-amp macro-model", "Slew, offset, clipping, noise, input/output impedance", "PCB parasitics", "Tolerance/temperature distributions"]},
        "specInterpretation": {"stopEdgeHz": "fc * stop_ratio",
                               "absoluteAttenuationDb": "-20*log10(abs(H))",
                               "relativeAttenuationDb": "targetGainDb - 20*log10(abs(H))",
                               "stopEdgeMarginDb": "attenuationDb - requiredStopDb"},
        "cases": cases,
        "conclusion": "Both selected stop-edge violations of the ideal engine disappear under the specified conditional one-pole model. This demonstrates that model mismatch can explain these counterexamples; it does not establish validity of all labels or full-band compliance.",
        "limitations": ["No Claude module, pasted command or supplied dataset script executed.",
                        "No ngspice reproduction performed by this diagnostic.",
                        "Only DC, assumed pass edge and assumed stop edge evaluated; no full-band extrema search.",
                        "NPZ physical decoding is explicitly inferred, and its float32/E24 normalization is recorded.",
                        "Original CSV rounding and the exact generator FilterSpec remain unverified."]}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(output, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    print(json.dumps({"output": str(args.out.resolve()),
                      "outputSha256": hashlib.sha256(args.out.read_bytes()).hexdigest(),
                      "cases": [{"caseId": c["caseId"],
                                 "stopHz": c["results"]["ideal"]["points"]["stopEdgeAssumption"]["frequencyHz"],
                                 "idealAbsoluteDb": c["results"]["ideal"]["absoluteStopAttenuationDb"],
                                 "finiteAbsoluteDb": c["results"]["onePoleConditional"]["absoluteStopAttenuationDb"],
                                 "finiteRelativeDb": c["results"]["onePoleConditional"]["relativeStopAttenuationDb"],
                                 "requiredDb": c["specValues"]["requiredStopDb"]} for c in cases]}, indent=2))


if __name__ == '__main__':
    main()
