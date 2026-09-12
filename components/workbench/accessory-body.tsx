import type { PhysicalModel } from '@/lib/workbench/physical';

/** Illustrative top views. Terminal geometry is shared with the 3D scene. */
export function AccessoryBody({
  model: m,
  angle = 90,
  display,
}: {
  model: PhysicalModel;
  angle?: number;
  display?: { rows: string[]; backlight: boolean };
}) {
  const { w, h, color } = m.body;
  const v = m.accessoryVisual;
  const circle = (x: number, y: number, r: number, fill: string, key = '') => (
    <circle
      key={key}
      cx={x}
      cy={y}
      r={r}
      fill={fill}
      stroke="#9baab1"
      strokeWidth={0.25}
    />
  );
  return (
    <g>
      <rect
        width={w}
        height={h}
        rx={1}
        fill={color}
        stroke="#183d48"
        strokeWidth={0.3}
      />
      {v === 'sonar' &&
        [10, w - 10].map((x) => (
          <g key={x}>
            {circle(x, 8, 7.8, '#c5cdd0')}
            {circle(x, 8, 6.6, '#303b41')}
            {[0, 1, 2, 3, 4].map((i) => (
              <path
                key={i}
                d={`M${x - 5},${4 + i * 2}h10`}
                stroke="#8799a1"
                strokeWidth={0.35}
              />
            ))}
          </g>
        ))}
      {v === 'servo' && (
        <g>
          <rect
            x={2}
            y={1}
            width={w - 4}
            height={h - 3}
            rx={2}
            fill="#2d8bd0"
          />
          {circle(7, 5, 3.8, '#cfdce5')}
          <rect
            x={2}
            y={3.6}
            width={18}
            height={2.8}
            rx={1.4}
            fill="#f7f7ed"
            transform={`rotate(${angle - 90} 7 5)`}
          />
          {circle(7, 5, 0.9, '#697580')}
        </g>
      )}
      {v === 'imu' && (
        <g>
          <rect x={7} y={3} width={5} height={5} rx={0.4} fill="#17202c" />
          <text
            x={w / 2}
            y={11}
            textAnchor="middle"
            fontSize={1.5}
            fill="white"
          >
            MPU6050
          </text>
          {[2, 15].map((x) => (
            <rect key={x} x={x} y={3} width={2} height={1} fill="#d5c7a2" />
          ))}
        </g>
      )}
      {v === 'lcd' && (
        <g>
          <rect
            x={4}
            y={3}
            width={w - 8}
            height={h - 8}
            rx={2}
            fill="#152638"
          />
          <rect x={8} y={7} width={w - 16} height={h - 16} fill="#1b577c" />
          {display?.rows.map((row, i) => (
            <text
              key={i}
              x={10}
              y={14 + i * 8}
              fontFamily="monospace"
              fontSize={4.6}
              fill={display.backlight ? '#beecb9' : '#658782'}
            >
              {row}
            </text>
          ))}
          {!display &&
            [0, 1].flatMap((row) =>
              Array.from({ length: 16 }, (_, col) => (
                <rect
                  key={`${row}-${col}`}
                  x={10 + col * 3.75}
                  y={10 + row * 8}
                  width={2.7}
                  height={5}
                  fill="#2e7397"
                />
              )),
            )}
        </g>
      )}
      {v === 'pir' && (
        <g>
          {circle(w / 2, h / 2 - 2, 9, '#ecefeb')}
          {[3, 6].map((r) => (
            <circle
              key={r}
              cx={w / 2}
              cy={h / 2 - 2}
              r={r}
              fill="none"
              stroke="#c1cbc7"
              strokeWidth={0.3}
            />
          ))}
        </g>
      )}
      {v === 'ldr' && (
        <g>
          {circle(7, 6, 4.5, '#d8a46b')}
          <path
            d="M4,3h6v1.3H4v1.3h6v1.3H4v1.3h6"
            fill="none"
            stroke="#764623"
            strokeWidth={0.45}
          />
          <rect x={19} y={2} width={6} height={7} rx={0.4} fill="#237cca" />
          {circle(22, 5.5, 1.7, '#d5d8cb')}
        </g>
      )}
      {v === 'joystick' && (
        <g>
          <rect x={7} y={3} width={20} height={17} rx={2} fill="#b3bbc1" />
          {circle(w / 2, h / 2 - 2, 9, '#202830')}
          {circle(w / 2, h / 2 - 2, 6.5, '#323b42')}
        </g>
      )}
      {v === 'encoder' && (
        <g>
          <rect x={5} y={2} width={15} height={12} rx={1} fill="#bdc6c9" />
          {circle(12.5, 8, 5, '#171d26')}
          {circle(12.5, 8, 2.8, '#d2dce0')}
        </g>
      )}
      {v === 'buzzer' && (
        <g>
          {circle(w / 2, h / 2 - 0.5, 5.5, '#171d24')}
          {circle(w / 2, h / 2 - 0.5, 1.4, '#05090d')}
          <text x={8} y={4} fontSize={2.2} fill="#eee">
            +
          </text>
        </g>
      )}
      {v === 'thermometer' && (
        <g>
          <path d="M.4,3V1.8C.4,-.5 4.6,-.5 4.6,1.8V3Z" fill="#20262f" />
          <text x={2.5} y={2} textAnchor="middle" fontSize={0.7} fill="#ddd">
            18B20
          </text>
        </g>
      )}
      {v === 'keypad' &&
        Array.from({ length: 16 }, (_, i) => (
          <g key={i}>
            <rect
              x={5 + (i % 4) * 15}
              y={5 + Math.floor(i / 4) * 16}
              width={13}
              height={14}
              rx={3}
              fill={i % 4 === 3 ? '#da6e3f' : '#286486'}
              stroke="#98b1c0"
              strokeWidth={0.4}
            />
            <text
              x={11.5 + (i % 4) * 15}
              y={14 + Math.floor(i / 4) * 16}
              textAnchor="middle"
              fontSize={5}
              fill="#fff"
            >
              {'123A456B789C*0#D'[i]}
            </text>
          </g>
        ))}
      {v === 'pixel' && (
        <g>
          <rect
            x={0.5}
            y={0.3}
            width={4}
            height={3.3}
            rx={0.3}
            fill="#e6e3cc"
          />
          {circle(2.5, 1.9, 1.3, '#bfc5bb')}
          {['#e76565', '#66b58e', '#6797cf'].map((c, i) => (
            <rect
              key={c}
              x={1.5 + i * 0.7}
              y={1.5}
              width={0.5}
              height={0.7}
              fill={c}
            />
          ))}
        </g>
      )}
    </g>
  );
}
