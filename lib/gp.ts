// Small genuine Gaussian process: Matérn 5/2 kernel, standardized targets,
// fixed hyperparameters, Cholesky solve and expected improvement acquisition.
export function kernel(x: number[], y: number[]): number {
  const r = Math.sqrt(x.reduce((s, v, i) => s + ((v - y[i]) / 0.38) ** 2, 0)),
    t = Math.sqrt(5) * r;
  return (1 + t + (5 * r * r) / 3) * Math.exp(-t);
}
function forward(L: number[][], b: number[]): number[] {
  const v: number[] = [];
  for (let i = 0; i < b.length; i++) {
    let s = b[i];
    for (let j = 0; j < i; j++) s -= L[i][j] * v[j];
    v.push(s / L[i][i]);
  }
  return v;
}
export function fitGP(xs: number[][], ys: number[]) {
  const n = xs.length,
    mean = ys.reduce((s, v) => s + v, 0) / n;
  const scale = Math.max(
    0.001,
    Math.sqrt(ys.reduce((s, v) => s + (v - mean) ** 2, 0) / n),
  );
  const L = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = kernel(xs[i], xs[j]) + (i === j ? 1e-6 : 0);
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
    }
  const v = forward(
      L,
      ys.map((y) => (y - mean) / scale),
    ),
    alpha = Array(n).fill(0) as number[];
  for (let i = n - 1; i >= 0; i--) {
    let s = v[i];
    for (let j = i + 1; j < n; j++) s -= L[j][i] * alpha[j];
    alpha[i] = s / L[i][i];
  }
  return {
    predict(x: number[]) {
      const k = xs.map((y) => kernel(x, y)),
        u = forward(L, k);
      return {
        mean: mean + scale * k.reduce((s, t, i) => s + t * alpha[i], 0),
        sd:
          scale * Math.sqrt(Math.max(0, 1 - u.reduce((s, t) => s + t * t, 0))),
      };
    },
  };
}
export function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x)),
    d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const upper =
    d *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - upper : upper;
}
export function expectedImprovement(
  best: number,
  mean: number,
  sd: number,
  xi = 0.01,
): number {
  if (sd < 1e-12) return 0;
  const d = best - mean - xi,
    z = d / sd;
  return Math.max(
    0,
    d * normalCDF(z) + (sd * Math.exp((-z * z) / 2)) / Math.sqrt(2 * Math.PI),
  );
}
