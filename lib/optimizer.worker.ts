import { runExperiment } from './optimizer.ts';
import type { Specs } from './circuit.ts';
self.onmessage = async (event: MessageEvent<Specs>) => {
  try {
    const result = await runExperiment(event.data, {
      progress: (p) => self.postMessage({ type: 'progress', data: p }),
    });
    self.postMessage({ type: 'complete', data: result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'The calculation could not finish.',
    });
  }
};
