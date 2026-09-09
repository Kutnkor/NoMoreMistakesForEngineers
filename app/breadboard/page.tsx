/* oxlint-disable next/no-html-link-for-pages -- Static export uses native navigation to dispose page-scoped engines. */
'use client';
import { useEffect, useState } from 'react';
import { CircuitBoard, ArrowUpRight } from 'lucide-react';
import { Workbench } from '@/components/workbench/bench';
import { migrateV1 } from '@/lib/workbench/project';
import { autoPlace } from '@/lib/breadboard/model';
import { Button } from '@/components/ui/button';
import { BreadboardWorkspace } from '@/components/breadboard/workspace';
import { sallenKeyCircuit } from '@/lib/breadboard/circuits';
import '../studio.css';
import './breadboard.css';
import './workbench.css';
const cache = new WeakMap<object, ReturnType<typeof migrateV1>>();
function initialWorkbench(circuit: ReturnType<typeof sallenKeyCircuit>) {
  let w = cache.get(circuit);
  if (!w) {
    w = migrateV1(circuit, autoPlace(circuit));
    cache.set(circuit, w);
  }
  return w;
}
export default function BreadboardPage() {
  const [guided, setGuided] = useState(false);
  const [custom, setCustom] = useState(false);
  const [initial, setInitial] = useState(sallenKeyCircuit());
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (!q.has('r1')) return;
    // oxlint-disable-next-line react/react-compiler -- URL is an external source read once after hydration.
    setCustom(true);
    const p = {
      r1: Number(q.get('r1')),
      r2: Number(q.get('r2')),
      c1: Number(q.get('c1')),
      c2: Number(q.get('c2')),
    };
    if (Object.values(p).every((v) => Number.isFinite(v) && v > 0))
      // oxlint-disable-next-line react/react-compiler -- Hydrate the static page from the external browser URL once.
      setInitial(sallenKeyCircuit(p));
  }, []);
  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <a className="studio-brand" href="/">
          <span className="brand-mark">
            <CircuitBoard size={23} />
          </span>
          <div>
            CIRCUIT<span>FORGE</span>
            <small>BREADBOARD LAB</small>
          </div>
        </a>
        <nav>
          <a href="/">Hardware Studio</a>
          <a href="/lab">AI Laboratory</a>
          <a href="/filter">Filter AI</a>
        </nav>
        <a className="source-link" href="/research">
          Research evidence <ArrowUpRight size={15} />
        </a>
      </header>
      <div className="wb-modebar">
        <Button
          size="sm"
          variant={guided ? 'ghost' : 'default'}
          onClick={() => setGuided(false)}
        >
          Workbench
        </Button>
        <Button
          size="sm"
          variant={guided ? 'default' : 'ghost'}
          onClick={() => setGuided(true)}
        >
          Guided analog lab
        </Button>
      </div>
      <div hidden={guided}>
        <Workbench
          key={custom ? JSON.stringify(initial) : 'default'}
          active={!guided}
          initial={custom ? initialWorkbench(initial) : undefined}
        />
      </div>
      {guided && (
        <BreadboardWorkspace
          key={JSON.stringify(initial)}
          initialCircuit={initial}
        />
      )}
    </div>
  );
}
