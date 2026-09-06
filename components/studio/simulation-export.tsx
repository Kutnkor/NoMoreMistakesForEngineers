'use client';
import { useMemo, useState } from 'react';
import { Download, ExternalLink, Play, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { createWokwiProject, wokwiSupport } from '@/lib/hardware/wokwi';
import type { HardwarePlan } from '@/lib/hardware/types';
import { zipTextFiles } from '@/lib/zip';
import { saveFile } from '@/lib/save-file';
export function SimulationExport({ plan }: { plan: HardwarePlan }) {
  const [interactive, setInteractive] = useState(true),
    [notice, setNotice] = useState('');
  const support = wokwiSupport(plan);
  const hasPot = plan.items.some((i) => i.component.id === 'pot-10k');
  const project = useMemo(
    () => (support.supported ? createWokwiProject(plan, interactive) : null),
    [plan, interactive, support.supported],
  );
  return (
    <div className="simulation-export">
      <div className="sim-heading">
        <span className="sim-symbol">
          <Play size={24} />
        </span>
        <div>
          <h3>Run your circuit in Wokwi.</h3>
          <p>Code, wiring, and required libraries in one package.</p>
        </div>
      </div>
      {project ? (
        <>
          <div className="sim-ready">
            <CheckCircle2 size={17} />
            {plan.board.name} · {plan.items.length} matched modules ·{' '}
            {project.diagram.connections.length} connections
          </div>
          <div className="sim-toggle">
            <div>
              <strong>Potentiometer → LED and display</strong>
              <p>
                {hasPot
                  ? 'Add an LED or OLED to the plan to control it with the potentiometer.'
                  : 'Add a potentiometer to enable this interaction.'}
              </p>
            </div>
            <Switch
              aria-label={'Interactive potentiometer example'}
              disabled={!hasPot}
              checked={hasPot && interactive}
              onCheckedChange={setInteractive}
            />
          </div>
          <div className="sim-actions">
            <Button
              onClick={() => {
                saveFile(
                  'CircuitForge-' + plan.board.id + '.zip',
                  zipTextFiles(project.files),
                  'application/zip',
                );
                setNotice(
                  'Project package downloaded. Create a Wokwi project for the same board and add the files.',
                );
              }}
            >
              <Download size={16} />
              Download Wokwi project
            </Button>
            <a
              className="studio-secondary"
              href="https://wokwi.com/"
              target="_blank"
              rel="noreferrer"
            >
              Open Wokwi <ExternalLink size={15} />
            </a>
          </div>
          <ol className="sim-steps">
            <li>Create an Arduino/C++ project for the same board.</li>
            <li>
              Copy the package&apos;s <code>sketch.ino</code>,{' '}
              <code>diagram.json</code> and <code>libraries.txt</code> contents
              into the corresponding files.
            </li>
            <li>
              Press Play, turn the potentiometer, press the button, and watch
              the serial monitor.
            </li>
          </ol>
          <div className="sim-file-row">
            {['diagram.json', 'sketch.ino', 'libraries.txt'].map((name) => (
              <button
                key={name}
                onClick={() => saveFile(name, project.files[name])}
              >
                <Download size={13} />
                {name}
              </button>
            ))}
          </div>
          <details>
            <summary>Simulation scope and model differences</summary>
            {project.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
            <p>
              Files are not uploaded automatically. This site&apos;s wiring
              workspace is not an MCU emulator; Wokwi runs the code.
            </p>
            <a
              href="https://docs.wokwi.com/diagram-format"
              target="_blank"
              rel="noreferrer"
            >
              Wokwi documentation
            </a>
          </details>
        </>
      ) : (
        <div className="sim-unavailable">
          <Info size={22} />
          <div>
            <h4>This plan cannot be fully exported yet.</h4>
            <ul>
              {support.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p>
              Start with a supported board, LED, potentiometer, and button. You
              can also add an OLED and DHT22.
            </p>
          </div>
        </div>
      )}
      <output aria-live="polite">{notice}</output>
    </div>
  );
}
