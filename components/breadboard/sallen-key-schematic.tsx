/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- SVG groups and diagrams require ARIA roles; HTML buttons/images cannot replace vector elements. Pointer events are delegated on the SVG; the same part actions are available from keyboard-accessible tray buttons. */
'use client';
import { formatPart, type Parts } from '@/lib/circuit';
export function SallenKeySchematic({
  parts,
  hovered,
  onHover,
  onSelect,
  physical = false,
}: {
  parts: Parts;
  hovered?: string | null;
  onHover?: (ref: string | null) => void;
  onSelect?: (ref: string) => void;
  physical?: boolean;
}) {
  const resistor = (x: number, label: string, value: number) => (
    <g data-ref={x === 120 ? 'R1' : 'R2'}>
      <path d={`M${x - 32} 144h12m40 0h22`} stroke="currentColor" />
      <rect
        x={x - 20}
        y="135"
        width="40"
        height="18"
        fill="#eff6f8"
        stroke="#008a93"
      />
      <text x={x} y="122" textAnchor="middle" fill="#416978" fontSize="14">
        {label}
      </text>
      <text x={x} y="178" textAnchor="middle" fill="#586e7b" fontSize="13">
        {formatPart(value, 'R')}
      </text>
    </g>
  );
  return (
    <svg
      className="schematic bb-original-schematic"
      data-highlight={hovered ?? ''}
      onPointerOver={(e) => {
        const ref = (e.target as Element)
          .closest('[data-ref]')
          ?.getAttribute('data-ref');
        onHover?.(ref ?? null);
      }}
      onPointerLeave={() => onHover?.(null)}
      onClick={(e) => {
        const ref = (e.target as Element)
          .closest('[data-ref]')
          ?.getAttribute('data-ref');
        if (ref) onSelect?.(ref);
      }}
      viewBox="0 0 640 265"
      role="img"
      aria-label={`Unity-gain Sallen–Key circuit. R1 ${formatPart(parts.r1, 'R')}, R2 ${formatPart(parts.r2, 'R')}, C1 ${formatPart(parts.c1, 'C')}, C2 ${formatPart(parts.c2, 'C')}. C1 connects the first resistor node to the output; C2 connects the second resistor node to ground.`}
    >
      <g fill="none" stroke="#829daa" strokeWidth="1.8">
        <path d="M30 144h70m62 0h58m0 0h38m62 0h35m0 0h63" />
        {resistor(120, 'R₁', parts.r1)}
        {resistor(290, 'R₂', parts.r2)}
        <path d="M220 144V55H327m12 0h220v107h39" />
        <path data-ref="C1" d="M327 39v32m12-32v32" stroke="#008a93" />
        <path
          data-ref="C2"
          d="M355 144v52m-16 0h32m-32 11h32m-16 0v25m-16 0h32m-25 7h18m-12 7h6"
        />
        <path
          data-ref="U1"
          d="M418 115v94l86-47Z"
          fill="#edf7f7"
          stroke="#008a93"
        />
        <path d="M504 162h55m-20 0v59h-142v-34h21" />
        <circle cx="30" cy="144" r="4" fill="#ffffff" />
        <circle cx="598" cy="162" r="4" fill="#ffffff" />
      </g>
      <g fill="#008a93">
        {[
          [220, 144],
          [355, 144],
          [539, 162],
          [559, 162],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="3" />
        ))}
        <text x="427" y="148" fontSize="18">
          +
        </text>
        <text x="427" y="192" fontSize="18">
          −
        </text>
      </g>
      <text
        data-ref="C1"
        x="333"
        y="24"
        textAnchor="middle"
        fill="#416978"
        fontSize="14"
      >
        C₁ · {formatPart(parts.c1, 'C')}
      </text>
      <text data-ref="C2" x="372" y="212" fill="#586e7b" fontSize="13">
        C₂
      </text>
      <text data-ref="C2" x="372" y="231" fill="#586e7b" fontSize="13">
        {formatPart(parts.c2, 'C')}
      </text>
      <text x="17" y="119" fill="#586e7b" fontSize="13">
        Vᵢₙ
      </text>
      <text x="573" y="138" fill="#586e7b" fontSize="13">
        Vₒᵤₜ
      </text>
      <text x="443" y="99" fill="#586e7b" fontSize="12">
        {physical ? 'TL072 · A' : 'IDEAL'}
      </text>
    </svg>
  );
}
