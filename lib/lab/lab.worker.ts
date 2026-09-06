import { runBudgetExperiment } from './adaptive.ts';
import { checkModel, finiteAudit, type OpAmp } from './realistic.ts';
import {
  REFERENCE,
  validateSpecs,
  type Parts,
  type Specs,
} from '../circuit.ts';
type Request =
  | { type: 'budget'; specs: Specs; opAmp: OpAmp; budget: number }
  | { type: 'audit'; parts: Parts; specs: Specs; opAmp: OpAmp };
self.onmessage = async (e: MessageEvent<Request>) => {
  try {
    const r = e.data,
      error = validateSpecs(r.specs);
    if (error) throw Error(error);
    checkModel(r.type === 'audit' ? r.parts : REFERENCE, r.opAmp);
    const result =
      r.type === 'budget'
        ? await runBudgetExperiment(r.specs, r.opAmp, r.budget, {
            progress: (method, spent, budget) =>
              self.postMessage({ type: 'progress', method, spent, budget }),
            yield: () => new Promise((resolve) => setTimeout(resolve, 0)),
          })
        : finiteAudit(r.parts, r.specs, r.opAmp);
    self.postMessage({ type: 'complete', task: r.type, result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
