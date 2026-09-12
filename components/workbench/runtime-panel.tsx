'use client';
// oxlint-disable-next-line import/default -- Vite supplies the worker constructor for ?worker imports.
import AVRWorker from '@/lib/workbench/runtime/worker?worker';
import { useEffect, useRef, useState } from 'react';
import { compilerIssues, type CodeIssue } from '@/lib/workbench/compiler';
import { Play, Square, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EMPTY_FRAME, runtimeCircuit } from '@/lib/workbench/runtime/circuit';
import type {
  RuntimeFrame,
  RuntimeInputs,
} from '@/lib/workbench/runtime/circuit';
import type { RuntimeCommand } from '@/lib/workbench/runtime/worker';
import type { Workbench } from '@/lib/workbench/types';

export function RuntimePanel({
  workbench,
  onFrame,
  active,
  onIssues,
}: {
  workbench: Workbench;
  onFrame: (frame: RuntimeFrame) => void;
  active: boolean;
  onIssues: (issues: CodeIssue[]) => void;
}) {
  const [peripheralFrame, setPeripheralFrame] =
    useState<RuntimeFrame>(EMPTY_FRAME);
  const [status, setStatus] = useState('Ready');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [serial, setSerial] = useState('');
  const [message, setMessage] = useState('');
  const [milliseconds, setMilliseconds] = useState(0);
  const [inputs, setInputs] = useState<RuntimeInputs>({
    buttons: {},
    pots: {},
  });
  const worker = useRef<Worker | null>(null),
    request = useRef<AbortController | null>(null),
    generation = useRef(0);
  const upload = useRef<HTMLInputElement | null>(null);
  // Geometry/view edits do not restart firmware. Electrical/code edits do.
  const signature = JSON.stringify({
    instances: workbench.instances.map((i) => ({
      id: i.id,
      modelId: i.modelId,
      mounted: i.mounted,
      value: i.value,
    })),
    wires: workbench.wires.map((w) => ({ a: w.a, b: w.b })),
    firmware: workbench.firmware,
    libraries: workbench.libraries,
  });
  function stop() {
    generation.current++;
    request.current?.abort();
    request.current = null;
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setRunning(false);
    onFrame(EMPTY_FRAME);
    setPeripheralFrame(EMPTY_FRAME);
  }
  /* oxlint-disable react/react-compiler, react-hooks/exhaustive-deps -- Terminate and reset the external worker when the circuit changes; cleanup intentionally reads the latest worker created by Run. */
  useEffect(() => {
    // A circuit edit invalidates the compiled run, including pending requests.
    generation.current++;
    request.current?.abort();
    worker.current?.terminate();
    worker.current = null;
    // oxlint-disable-next-line react-hooks-js/set-state-in-effect -- Synchronize the external emulator after circuit changes.
    setRunning(false);
    setBusy(false);
    setStatus('Ready — run after wiring or code changes.');
    onFrame(EMPTY_FRAME);
    setPeripheralFrame(EMPTY_FRAME);
    return () => {
      generation.current++;
      request.current?.abort();
      worker.current?.terminate();
    };
  }, [signature, onFrame, active]);
  /* oxlint-enable react/react-compiler, react-hooks/exhaustive-deps */
  function launch(hex: string) {
    const circuit = runtimeCircuit(workbench);
    const w = new AVRWorker();
    worker.current = w;
    w.onmessage = (
      e: MessageEvent<{ type: string; frame?: RuntimeFrame; message?: string }>,
    ) => {
      if (worker.current !== w) return;
      if (e.data.type === 'error') {
        stop();
        setStatus(e.data.message ?? 'Simulation stopped.');
        return;
      }
      if (e.data.frame) {
        onFrame(e.data.frame);
        setPeripheralFrame(e.data.frame);
        setSerial(e.data.frame.serial);
        setMilliseconds(e.data.frame.milliseconds);
      }
    };
    w.onerror = () => {
      stop();
      setStatus('The simulation worker could not start. Reload and retry.');
    };
    w.postMessage({
      type: 'start',
      hex,
      circuit,
      inputs,
    } satisfies RuntimeCommand);
    setBusy(false);
    setRunning(true);
    setStatus('Running · ATmega328P · 16 MHz simulated clock');
  }
  async function run() {
    stop();
    setSerial('');
    onIssues([]);
    setMilliseconds(0);
    const requestedGeneration = generation.current;
    try {
      runtimeCircuit(workbench);
      if (!workbench.firmware?.trim())
        throw Error(
          'Generate a sketch from the wiring or paste your Arduino code first.',
        );
      if (
        workbench.libraries
          ?.split('\n')
          .some((l) => l.trim() && !['Servo', 'Wire'].includes(l.trim()))
      )
        throw Error(
          'The in-app compiler supports the Arduino core and built-in libraries. For external libraries, compile for Arduino UNO in Arduino IDE and load the exported HEX, or use Export simulation.',
        );
      setBusy(true);
      setStatus('Compiling with Wokwi…');
      const controller = new AbortController();
      request.current = controller;
      const runId = generation.current;
      const timeout = setTimeout(() => controller.abort(), 60000);
      try {
        const response = await fetch('https://hexi.wokwi.com/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sketch: workbench.firmware }),
          signal: controller.signal,
        });
        if (!response.ok)
          throw Error(
            `Compiler unavailable (${response.status}). Retry, or load a HEX compiled for Arduino UNO.`,
          );
        const data = (await response.json()) as {
          hex?: string;
          stdout?: string;
          stderr?: string;
        };
        if (runId !== generation.current) return;
        onIssues(compilerIssues(data.stderr || data.stdout || ''));
        if (!data.hex)
          throw Error(
            (data.stderr || data.stdout || 'Compilation failed.').slice(
              0,
              10000,
            ),
          );
        launch(data.hex);
      } finally {
        clearTimeout(timeout);
      }
    } catch (e) {
      if (requestedGeneration !== generation.current) return;
      if ((e as Error).name === 'AbortError') {
        setStatus('Compilation cancelled or timed out.');
        setBusy(false);
      } else {
        setStatus((e as Error).message);
        setBusy(false);
      }
    }
  }
  function input(next: RuntimeInputs) {
    setInputs(next);
    worker.current?.postMessage({
      type: 'inputs',
      inputs: next,
    } satisfies RuntimeCommand);
  }
  const controls = workbench.instances.filter((i) =>
    ['part-button', 'part-potentiometer', 'module-hc-sr04'].includes(i.modelId),
  );
  return (
    <section className="wb-runtime" aria-label="Arduino runtime">
      <div className="wb-runtime-head">
        <Button
          size="sm"
          disabled={busy || running || !active}
          onClick={() => void run()}
        >
          <Play size={14} />
          Run sketch
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!busy && !running}
          onClick={() => {
            stop();
            setStatus('Stopped');
          }}
        >
          <Square size={14} />
          Stop
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => upload.current?.click()}
        >
          <Upload size={14} />
          Load HEX
        </Button>
        <span className={running ? 'wb-live' : ''}>
          {(milliseconds / 1000).toFixed(2)} s simulated
        </span>
      </div>
      <output className="wb-runtime-status">{status}</output>
      <p className="wb-runtime-note">
        Run sends this sketch to Wokwi’s online compiler. HEX execution stays in
        your browser. Supports UNO R3 / classic Nano, LEDs with series
        resistors, buttons, potentiometers, servos, HC-SR04 and an I²C LCD1602.
        Other parts use Export simulation.
      </p>
      <input
        hidden
        ref={upload}
        type="file"
        accept=".hex"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          stop();
          const id = generation.current;
          if (file.size > 120000) {
            setStatus('HEX file is too large for this controller.');
            return;
          }
          void file.text().then(
            (hex) => {
              if (id !== generation.current) return;
              try {
                launch(hex);
              } catch (error) {
                setStatus((error as Error).message);
              }
            },
            () => setStatus('Could not read the HEX file.'),
          );
        }}
      />
      {controls.length > 0 && (
        <div className="wb-runtime-controls">
          {controls.map((i) =>
            i.modelId === 'part-button' ? (
              <Button
                key={i.id}
                size="sm"
                variant={inputs.buttons[i.id] ? 'default' : 'outline'}
                aria-pressed={!!inputs.buttons[i.id]}
                disabled={!running}
                onClick={() =>
                  input({
                    ...inputs,
                    buttons: {
                      ...inputs.buttons,
                      [i.id]: !inputs.buttons[i.id],
                    },
                  })
                }
              >
                {i.name}: {inputs.buttons[i.id] ? 'pressed' : 'released'}
              </Button>
            ) : (
              <label key={i.id}>
                {i.name} ·{' '}
                {i.modelId === 'module-hc-sr04'
                  ? `${inputs.distances?.[i.id] ?? 100} cm`
                  : `${Math.round((inputs.pots[i.id] ?? 0.5) * 100)}%`}
                <input
                  aria-label={`${i.name} position`}
                  type="range"
                  min={i.modelId === 'module-hc-sr04' ? 2 : 0}
                  max={i.modelId === 'module-hc-sr04' ? 400 : 100}
                  disabled={!running}
                  value={
                    i.modelId === 'module-hc-sr04'
                      ? (inputs.distances?.[i.id] ?? 100)
                      : (inputs.pots[i.id] ?? 0.5) * 100
                  }
                  onChange={(e) =>
                    input({
                      ...inputs,
                      ...(i.modelId === 'module-hc-sr04'
                        ? {
                            distances: {
                              ...inputs.distances,
                              [i.id]: Number(e.target.value),
                            },
                          }
                        : {
                            pots: {
                              ...inputs.pots,
                              [i.id]: Number(e.target.value) / 100,
                            },
                          }),
                    })
                  }
                />
              </label>
            ),
          )}
        </div>
      )}
      <div className="wb-peripheral-output">
        {Object.entries(peripheralFrame.servos ?? {}).map(([id, angle]) => (
          <span key={id}>
            {id}: {angle.toFixed(0)}°
          </span>
        ))}
        {Object.entries(peripheralFrame.displays ?? {}).map(([id, lcd]) => (
          <div key={id}>
            <small>{id}</small>
            <pre
              className="wb-lcd-output"
              style={{ opacity: lcd.backlight ? 1 : 0.5 }}
            >
              {lcd.rows.join('\n')}
            </pre>
          </div>
        ))}
      </div>
      <details open={running || serial.length > 0}>
        <summary>Serial monitor</summary>
        <pre className="wb-serial" aria-label="Serial output">
          {serial || 'Serial output appears here when your sketch transmits.'}
        </pre>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            worker.current?.postMessage({
              type: 'serial',
              text: message + '\n',
            } satisfies RuntimeCommand);
            setMessage('');
          }}
        >
          <input
            aria-label="Serial input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={512}
            placeholder="Send text with newline"
            disabled={!running}
          />
          <Button type="submit" size="sm" variant="outline" disabled={!running}>
            Send
          </Button>
        </form>
      </details>
    </section>
  );
}
