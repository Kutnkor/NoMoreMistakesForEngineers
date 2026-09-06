/* oxlint-disable jsx-a11y/prefer-tag-over-role -- SVG groups and diagrams require ARIA roles; HTML buttons/images cannot replace vector elements. */
'use client';
import {
  pinsOf,
  formatValue,
  netColor,
  type Circuit,
} from '@/lib/breadboard/model';
export function NetSchematic({
  circuit,
  hovered,
  onHover,
  onSelect,
}: {
  circuit: Circuit;
  hovered: string | null;
  onHover: (ref: string | null) => void;
  onSelect: (ref: string) => void;
}) {
  const passives = circuit.components.filter((c) => c.type !== 'ic_dip8'),
    ics = circuit.components.filter((c) => c.type === 'ic_dip8'),
    height = Math.max(160, passives.length * 48 + 12, ics.length * 150);
  return (
    <svg
      className="bb-net-schematic"
      viewBox={`0 0 680 ${height}`}
      role="img"
      aria-label={'Target circuit schematic with labeled nodes'}
    >
      {passives.map((c, i) => {
        const y = 28 + i * 48,
          pins = pinsOf(c);
        return (
          <g
            key={c.ref}
            data-schematic-part={c.ref}
            data-active={hovered === c.ref}
            className="bb-schema-part"
            role="button"
            tabIndex={0}
            aria-label={`${c.ref}, ${formatValue(c)}`}
            onPointerEnter={() => onHover(c.ref)}
            onPointerLeave={() => onHover(null)}
            onFocus={() => onHover(c.ref)}
            onClick={() => onSelect(c.ref)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSelect(c.ref);
            }}
          >
            <rect
              x="4"
              y={y - 25}
              width="320"
              height="46"
              rx="5"
              className="bb-schema-halo"
            />
            <path
              d={`M72,${y} H135 M185,${y} H252`}
              stroke="#709097"
              fill="none"
              strokeWidth="1.7"
            />
            {c.type === 'resistor' ? (
              <path
                d={`M135,${y - 7} h50 v14 h-50 Z`}
                fill="#f4f6f4"
                stroke="#318d8f"
                strokeWidth="1.7"
              />
            ) : c.type.startsWith('capacitor') ? (
              <path
                d={`M135,${y} H153 m0,-12 v24 M167,${y - 12} v24 m0,-12 h18`}
                fill="none"
                stroke="#318d8f"
                strokeWidth="2"
              />
            ) : c.type === 'inductor' ? (
              <path
                d={`M135,${y} c0,-20 12,-20 12,0 c0,-20 12,-20 12,0 c0,-20 12,-20 12,0 c0,-20 14,-20 14,0`}
                fill="none"
                stroke="#318d8f"
                strokeWidth="1.8"
              />
            ) : (
              <path d={`M135,${y} H185`} stroke="#318d8f" strokeWidth="2" />
            )}
            <text
              x="160"
              y={y - 14}
              textAnchor="middle"
              fill="#244a54"
              fontSize="13"
            >
              {c.ref} · {formatValue(c)}
            </text>
            <text
              x="68"
              y={y + 4}
              textAnchor="end"
              fontSize="12"
              fill={netColor(pins[0][1], circuit)}
            >
              {pins[0][1]}
              {c.type === 'capacitor_electrolytic' ? ' +' : ''}
            </text>
            <text
              x="257"
              y={y + 4}
              fontSize="12"
              fill={netColor(pins[1][1], circuit)}
            >
              {pins[1][1]}
            </text>
            <circle cx="72" cy={y} r="2.5" fill="#478c8e" />
            <circle cx="252" cy={y} r="2.5" fill="#478c8e" />
          </g>
        );
      })}
      {ics.map((c, i) => (
        <g
          key={c.ref}
          transform={`translate(350 ${20 + i * 160})`}
          data-schematic-part={c.ref}
          data-active={hovered === c.ref}
          className="bb-schema-part"
          onPointerEnter={() => onHover(c.ref)}
          onPointerLeave={() => onHover(null)}
          onClick={() => onSelect(c.ref)}
          role="button"
          tabIndex={0}
          aria-label={`${c.ref} ${c.part}`}
        >
          <rect
            className="bb-schema-halo"
            x="0"
            y="-15"
            width="320"
            height="155"
            rx="6"
          />
          <rect
            x="100"
            y="8"
            width="95"
            height="112"
            fill="#eef5f3"
            stroke="#358a8c"
            strokeWidth="1.5"
          />
          <path d="M138,8 a9,9 0 0 0 18,0" fill="none" stroke="#358a8c" />
          <text x="147" y="-2" textAnchor="middle" fill="#244a54" fontSize="13">
            {c.ref} · {c.part}
          </text>
          {pinsOf(c).map(([pin, net]) => {
            const left = Number(pin) <= 4,
              index = left ? Number(pin) - 1 : 8 - Number(pin),
              y = 31 + index * 25;
            return (
              <g key={pin}>
                <path
                  d={left ? `M75,${y} H100` : `M195,${y} H220`}
                  stroke="#709097"
                  strokeWidth="1.4"
                />
                <text
                  x={left ? 107 : 188}
                  y={y + 4}
                  textAnchor={left ? 'start' : 'end'}
                  fill="#3b6570"
                  fontSize="12"
                >
                  {pin}
                </text>
                <text
                  x={left ? 70 : 225}
                  y={y + 4}
                  textAnchor={left ? 'end' : 'start'}
                  fill={netColor(net, circuit)}
                  fontSize="12"
                >
                  {net}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
