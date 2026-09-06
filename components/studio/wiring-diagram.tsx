import type { CSSProperties } from 'react';
import type { HardwarePlan } from '@/lib/hardware/types';
import { ProductPhoto } from './product-photo';
export function WiringDiagram({ plan }: { plan: HardwarePlan }) {
  const modules = plan.items;
  const count = Math.max(modules.length, 2);
  const h = count * 142 + 32;
  return (
    <div className="wiring-canvas">
      <div className="canvas-label">
        <span>
          <i /> PRODUCTS &amp; CONNECTIONS
        </span>
        <span>Select an image to inspect it</span>
      </div>
      <div
        className="photo-workbench"
        style={
          {
            '--module-count': count,
            '--bench-height': h + 'px',
          } as CSSProperties
        }
      >
        <div className="bench-controller">
          <span className="bench-overline">YOUR CONTROLLER BOARD</span>
          <ProductPhoto
            id={plan.board.id}
            name={plan.board.name}
            className="bench-board-photo"
            eager
            inspect
          />
          <h3>{plan.board.name}</h3>
          <p>{plan.board.mcu}</p>
          <div className="bench-spec">
            <span>{plan.board.logicVoltage ?? '?'} V logic</span>
            <span>{plan.usedPins.length} pins assigned</span>
          </div>
        </div>
        <svg
          className="bench-links"
          viewBox={`0 0 100 ${h}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {modules.map((item, i) => {
            const y = 16 + i * 142 + 63;
            const connected = plan.wires.some(
              (w) => w.itemId === item.selection.id,
            );
            const error = plan.issues.some(
              (x) => x.itemId === item.selection.id && x.severity === 'error',
            );
            return (
              connected && (
                <g key={item.selection.id}>
                  <path
                    d={`M 0 ${h / 2} C 45 ${h / 2}, 45 ${y}, 100 ${y}`}
                    fill="none"
                    stroke={
                      error
                        ? '#da765c'
                        : ['#008c95', '#df9b40', '#607dc0', '#7c65b4'][i % 4]
                    }
                    strokeWidth="1.8"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx="99"
                    cy={y}
                    r="2"
                    fill={error ? '#da765c' : '#008c95'}
                  />
                </g>
              )
            );
          })}
        </svg>
        <div className="bench-modules">
          {modules.map((item, i) => {
            const signals = plan.wires.filter(
              (w) =>
                w.itemId === item.selection.id &&
                !['ground', 'power'].includes(w.role),
            );
            return (
              <article className="bench-module" key={item.selection.id}>
                <ProductPhoto
                  id={item.component.id}
                  name={item.component.name}
                  className="bench-part-photo"
                  inspect
                />
                <div className="bench-module-info">
                  <small>MODULE {String(i + 1).padStart(2, '0')}</small>
                  <h3>{item.component.name}</h3>
                  <div className="bench-pins">
                    {signals.map((w) => (
                      <span key={w.signal}>
                        <b>{w.boardPin}</b>
                        {w.signal}
                      </span>
                    ))}
                    {!signals.length && (
                      <span>
                        {item.component.template === 'passive'
                          ? 'Supporting component'
                          : 'No connection defined'}
                      </span>
                    )}
                  </div>
                  <p>
                    {item.power ? item.power + ' · ' : ''}
                    {plan.wires.some(
                      (w) =>
                        w.itemId === item.selection.id && w.role === 'ground',
                    )
                      ? 'Common GND'
                      : item.component.interface}
                  </p>
                </div>
              </article>
            );
          })}
          {!modules.length && (
            <div className="bench-empty">
              <h3>Add your first component.</h3>
              <p>Choose a component from the library on the left.</p>
            </div>
          )}
        </div>
      </div>
      <div className="canvas-footnote">
        Lines correspond to the pin labels listed below, not to physical holes
        in the photographs.
      </div>
    </div>
  );
}
