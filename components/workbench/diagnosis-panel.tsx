'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { inspectConnections, diagnoseSignals } from '@/lib/workbench/diagnosis';
import { FAULT_NAMES, type FaultModel } from '@/lib/lab/faults';
import type { Workbench } from '@/lib/workbench/types';
import type { TargetIssue } from '@/lib/workbench/target';
export function DiagnosisPanel({
  workbench,
  onLocate,
  onRepair,
}: {
  workbench: Workbench;
  onLocate: (i: TargetIssue) => void;
  onRepair: (i: TargetIssue) => void;
}) {
  const [model, setModel] = useState<FaultModel | null>(null),
    [failure, setFailure] = useState('');
  useEffect(() => {
    const ctrl = new AbortController();
    void fetch('/models/fault-mlp.json', { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw Error('Model could not be loaded.');
        return r.json();
      })
      .then((value) => setModel(value as FaultModel))
      .catch((e) => {
        if (e.name !== 'AbortError') setFailure(e.message);
      });
    return () => ctrl.abort();
  }, []);
  const checks = inspectConnections(workbench),
    result = model ? diagnoseSignals(workbench, model) : null;
  const predicted = result?.prediction?.predicted;
  const id =
    predicted && predicted !== 'healthy'
      ? predicted.split('-')[0].toUpperCase()
      : undefined;
  const repair = checks.find(
    (i) => i.code === 'target-value' && i.instanceId === id,
  );
  return (
    <section className="wb-diagnosis">
      <b>Diagnose my circuit</b>
      <h4>Connection and reference checks</h4>
      {!checks.length && (
        <p>
          No known connection errors found. This does not establish that the
          circuit or code will work.
        </p>
      )}
      {checks.slice(0, 20).map((i, k) => (
        <article key={k}>
          <p>
            <b>{i.severity === 'error' ? 'Error' : 'Check'}:</b> {i.text}
          </p>
          <Button size="sm" variant="outline" onClick={() => onLocate(i)}>
            Show connection
          </Button>
          {i.code.startsWith('target-') && (
            <Button size="sm" variant="ghost" onClick={() => onRepair(i)}>
              Preview repair
            </Button>
          )}
        </article>
      ))}
      <h4>Fault AI · simulated signal evidence</h4>
      <p>{result?.reason ?? (failure || 'Loading the trained model…')}</p>
      {result?.prediction && (
        <>
          <p>
            <b>
              {predicted
                ? FAULT_NAMES[predicted]
                : 'Insufficient confidence — no diagnosis'}
            </b>
          </p>
          <p>
            {result.prediction.scores
              .slice(0, 3)
              .map(
                (s) =>
                  `${FAULT_NAMES[s.label]}: ${(s.score * 100).toFixed(1)}% model score`,
              )
              .join(' · ')}
          </p>
          <small>
            Scores are not calibrated probabilities. The model was evaluated on
            synthetic data, not physical hardware.
          </small>
          {id && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onLocate({
                  code: 'ai-suspect',
                  severity: 'warning',
                  text: 'AI suspect',
                  instanceId: id,
                })
              }
            >
              Show suspected component
            </Button>
          )}
          {repair && (
            <Button size="sm" onClick={() => onRepair(repair)}>
              Preview reference-value repair
            </Button>
          )}
        </>
      )}
    </section>
  );
}
