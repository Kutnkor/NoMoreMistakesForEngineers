import { CircuitAVR } from './avr';
import type { RuntimeCircuit, RuntimeInputs } from './circuit';
export type RuntimeCommand =
  | {
      type: 'start';
      hex: string;
      circuit: RuntimeCircuit;
      inputs: RuntimeInputs;
    }
  | { type: 'inputs'; inputs: RuntimeInputs }
  | { type: 'serial'; text: string }
  | { type: 'stop' };
let avr: CircuitAVR | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
function stop() {
  clearTimeout(timer);
  avr = null;
}
function tick() {
  if (!avr) return;
  const began = performance.now();
  try {
    avr.step(320000);
    postMessage({ type: 'frame', frame: avr.frame() });
  } catch (e) {
    stop();
    postMessage({ type: 'error', message: (e as Error).message });
    return;
  }
  timer = setTimeout(tick, Math.max(0, 20 - (performance.now() - began)));
}
onmessage = (event: MessageEvent<RuntimeCommand>) => {
  try {
    const m = event.data;
    if (m.type === 'start') {
      stop();
      avr = new CircuitAVR(m.hex, m.circuit);
      avr.setInputs(m.inputs);
      tick();
    } else if (m.type === 'stop') stop();
    else if (m.type === 'inputs') avr?.setInputs(m.inputs);
    else avr?.sendSerial(m.text);
  } catch (e) {
    stop();
    postMessage({ type: 'error', message: (e as Error).message });
  }
};
