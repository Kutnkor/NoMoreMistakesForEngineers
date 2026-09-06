import {
  decode,
  encode,
  partsKey,
  rng,
  toleranceDraws,
  validateSpecs,
  type Parts,
  type Specs,
} from '../circuit.ts';
import { propose, type Trial } from '../optimizer.ts';
import { expectedImprovement, fitGP } from '../gp.ts';
import {
  checkModel,
  finiteAudit,
  finiteScores,
  scoreOf,
  type OpAmp,
} from './realistic.ts';

export type BudgetMethod = 'adaptive' | 'gp' | 'random';
export type BudgetRow = {
  parts: Parts;
  cost: number;
  fidelity: 8 | 48;
  score: number;
  bestFullScore: number | null;
  operation: 'screen' | 'promote' | 'full';
};
export type BudgetResult = {
  method: BudgetMethod;
  history: BudgetRow[];
  spent: number;
  fullEvaluations: number;
  screens: number;
  winner: Parts;
  trainingScore: number;
  audit: ReturnType<typeof finiteAudit>;
  elapsedMs: number;
};
export type BudgetExperiment = {
  version: string;
  specs: Specs;
  opAmp: OpAmp;
  budget: number;
  initialDesigns: number;
  lowDraws: number;
  fullDraws: number;
  testDraws: number;
  testCost: number;
  methods: BudgetResult[];
  elapsedMs: number;
  costDefinition: string;
};
export async function runBudgetExperiment(
  s: Specs,
  op: OpAmp,
  budget: number,
  hooks: {
    progress?: (method: BudgetMethod, spent: number, budget: number) => void;
    yield?: () => Promise<void>;
    cancelled?: () => boolean;
  } = {},
): Promise<BudgetExperiment> {
  const error = validateSpecs(s);
  if (error) throw Error(error);
  checkModel({ r1: 1000, r2: 1000, c1: 1e-9, c2: 1e-9 }, op);
  if (![768, 1536, 3072].includes(budget))
    throw Error('The budget must be 768, 1536, or 3072.');
  const start = performance.now(),
    draws = toleranceDraws(s, 48, (s.seed ^ 0x1234abcd) >>> 0),
    low = draws.slice(0, 8),
    initRand = rng(s.seed);
  const initial: Parts[] = [],
    initialKeys = new Set<string>();
  while (initial.length < 8) {
    const p = decode(Array.from({ length: 4 }, () => initRand()));
    if (!initialKeys.has(partsKey(p))) {
      initial.push(p);
      initialKeys.add(partsKey(p));
    }
  }
  const methods: BudgetResult[] = [];
  for (const method of ['adaptive', 'gp', 'random'] as BudgetMethod[]) {
    const began = performance.now(),
      random = rng((s.seed ^ 0x51399) >>> 0),
      history: BudgetRow[] = [],
      full: Trial[] = [],
      pending: { parts: Parts; lowScore: number; scores: number[] }[] = [],
      seen = new Set<string>();
    const paired: { parts: Parts; lowScore: number; score: number }[] = [];
    let spent = 0,
      screens = 0;
    function fullEval(
      p: Parts,
      operation: BudgetRow['operation'] = 'full',
      priorScores: number[] = [],
    ) {
      // Cached low-fidelity observations are reused: a promotion executes exactly 40 new draws.
      const values = [
        ...priorScores,
        ...finiteScores(p, s, op, draws.slice(priorScores.length)),
      ];
      const score = scoreOf(values),
        cost = 48 - priorScores.length;
      spent += cost;
      seen.add(partsKey(p));
      full.push({
        iteration: full.length + 1,
        parts: p,
        score,
        bestScore: Math.min(score, full.at(-1)?.bestScore ?? Infinity),
        phase:
          full.length < 8
            ? 'initial'
            : method === 'random'
              ? 'random'
              : 'learned',
      });
      paired.push({ parts: p, lowScore: scoreOf(values.slice(0, 8)), score });
      history.push({
        parts: p,
        cost,
        fidelity: 48,
        score,
        bestFullScore: full.at(-1)!.bestScore,
        operation,
      });
    }
    function fresh() {
      let p: Parts;
      do {
        p = decode(Array.from({ length: 4 }, () => random()));
      } while (seen.has(partsKey(p)));
      seen.add(partsKey(p));
      return p;
    }
    for (const p of initial) fullEval(p);
    while (spent < budget) {
      if (hooks.cancelled?.()) throw Error('CANCELLED');
      const remaining = budget - spent;
      if (method === 'adaptive') {
        let chosen = -1,
          bestEI = -Infinity;
        if (pending.length && remaining >= 40) {
          const feature = (p: Parts, score: number) => [
            ...encode(p),
            Math.tanh(score),
          ];
          const gp = fitGP(
            paired.map((t) => feature(t.parts, t.lowScore)),
            paired.map((t) => Math.asinh(t.score)),
          );
          const incumbent = Math.min(...paired.map((t) => Math.asinh(t.score)));
          pending.forEach((p, i) => {
            const pred = gp.predict(feature(p.parts, p.lowScore)),
              ei = expectedImprovement(incumbent, pred.mean, pred.sd);
            if (ei > bestEI) {
              chosen = i;
              bestEI = ei;
            }
          });
        }
        // Learned EI gates detailed evaluations. The pool cap prevents endless screening.
        if (
          chosen >= 0 &&
          (bestEI > 0.006 || pending.length >= 24) &&
          remaining >= 40
        ) {
          const p = pending.splice(chosen, 1)[0];
          fullEval(p.parts, 'promote', p.scores);
        } else {
          const p = fresh(),
            scores = finiteScores(p, s, op, low),
            score = scoreOf(scores);
          spent += 8;
          screens++;
          pending.push({ parts: p, lowScore: score, scores });
          history.push({
            parts: p,
            cost: 8,
            fidelity: 8,
            score,
            bestFullScore: full.at(-1)!.bestScore,
            operation: 'screen',
          });
        }
      } else {
        if (remaining < 48) throw Error('Internal full-budget mismatch');
        fullEval(method === 'gp' ? propose(full, random) : fresh());
      }
      hooks.progress?.(method, spent, budget);
      await hooks.yield?.();
    }
    // Freeze selection before accessing held-out draws. Partial screens cannot win.
    const winner = [...full].sort((a, b) => a.score - b.score)[0];
    const elapsedMs = performance.now() - began;
    methods.push({
      method,
      history,
      spent,
      fullEvaluations: full.length,
      screens,
      winner: winner.parts,
      trainingScore: winner.score,
      audit: finiteAudit(winner.parts, s, op, 1024),
      elapsedMs,
    });
  }
  return {
    version: 'budget-1.0',
    specs: { ...s },
    opAmp: { ...op },
    budget,
    initialDesigns: 8,
    lowDraws: 8,
    fullDraws: 48,
    testDraws: 1024,
    testCost: 3072,
    methods,
    elapsedMs: performance.now() - start,
    costDefinition:
      'One circuit realization evaluated over complete AC bands = one oracle evaluation. Total method wall time, including GP fitting and acquisition, is reported in elapsedMs. Final held-out evaluation is 1024 per method, outside the equal search budgets.',
  };
}
