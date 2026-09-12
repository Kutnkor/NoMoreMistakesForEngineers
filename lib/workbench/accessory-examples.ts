import { lookupModel } from './registry.ts';
import { captureTarget } from './target.ts';
import type { Workbench, ConnectionEndpoint } from './types.ts';

export const ACCESSORY_EXAMPLES = [
  {
    id: 'distance-servo',
    name: 'Distance-controlled servo · run code',
    modelId: 'module-hc-sr04',
  },
  {
    id: 'sonar',
    name: 'UNO distance sensor · run code',
    modelId: 'module-hc-sr04',
  },
  { id: 'servo', name: 'UNO servo sweep · run code', modelId: 'module-servo' },
  { id: 'lcd', name: 'UNO I²C LCD · run code', modelId: 'module-lcd1602-i2c' },
] as const;

/** Reference wiring and sketches supported locally and by Wokwi export. */
export function accessoryWorkbench(id: string): Workbench {
  const ex = ACCESSORY_EXAMPLES.find((e) => e.id === id);
  if (!ex) throw Error('Unknown accessory example');
  const w: Workbench = { version: 2, title: ex.name, instances: [], wires: [] };
  for (const [instanceId, modelId, x, y] of [
    ['uno', 'uno-rev3', -40, 55],
    ['bb1', 'breadboard-830', 0, -30],
    ['module', ex.modelId, 60, 55],
  ] as const) {
    const m = lookupModel(modelId)!;
    w.instances.push({
      id: instanceId,
      name: m.name,
      modelId,
      kind: m.kind,
      transform: { x, y, rot: 0 },
    });
  }
  const pin = (instanceId: string, label: string): ConnectionEndpoint => {
    const i = w.instances.find((i) => i.id === instanceId)!;
    const p = lookupModel(i.modelId)!.pins.find((p) => p.label === label)!;
    return {
      kind: i.kind === 'board' ? 'board-pin' : 'component-pin',
      instanceId,
      pinId: p.id,
    };
  };
  const hole = (holeId: string): ConnectionEndpoint => ({
    kind: 'breadboard-hole',
    instanceId: 'bb1',
    holeId,
  });
  const wire = (
    a: ConnectionEndpoint,
    b: ConnectionEndpoint,
    color = '#288ab1',
  ) => w.wires.push({ id: `w${w.wires.length + 1}`, a, b, color, route: [] });
  wire(pin('uno', 'GND'), hole('1-T-'), '#293440');
  wire(hole('2-T-'), pin('module', 'GND'), '#293440');
  wire(pin('uno', '5V'), hole('1-T+'), '#d74748');
  wire(hole('2-T+'), pin('module', id === 'servo' ? 'V+' : 'VCC'), '#d74748');
  if (id === 'sonar' || id === 'distance-servo') {
    wire(pin('uno', 'D3'), pin('module', 'TRIG'));
    wire(pin('uno', 'D2'), pin('module', 'ECHO'), '#c99d35');
    w.firmware = `// Wokwi: change the sensor distance while the simulation runs.
void setup() {
  Serial.begin(115200);
  pinMode(3, OUTPUT);
  pinMode(2, INPUT);
}
void loop() {
  digitalWrite(3, LOW); delayMicroseconds(2);
  digitalWrite(3, HIGH); delayMicroseconds(10); digitalWrite(3, LOW);
  unsigned long echo = pulseIn(2, HIGH, 30000);
  if (echo == 0) Serial.println("No echo");
  else { Serial.print(echo / 58.0); Serial.println(" cm"); }
  delay(100);
}
`;
    w.libraries = '';
  } else if (id === 'servo') {
    wire(pin('uno', 'D9'), pin('module', 'PWM'));
    w.firmware = `// Simulator reference. For real hardware, use a suitable external
// 5 V servo supply and share ground. Do not assume USB supplies stall current.
#include <Servo.h>
Servo motor;
void setup() { motor.attach(9); }
void loop() {
  for (int angle = 0; angle <= 180; angle++) { motor.write(angle); delay(15); }
  for (int angle = 179; angle > 0; angle--) { motor.write(angle); delay(15); }
}
`;
    w.libraries = 'Servo\n';
  } else {
    wire(pin('uno', 'A4'), pin('module', 'SDA'));
    wire(pin('uno', 'A5'), pin('module', 'SCL'), '#a773bd');
    w.firmware = `// Built-in Wire library; PCF8574T backpack at 0x27, 4-bit write mode.
#include <Wire.h>
void expander(byte value) { Wire.beginTransmission(0x27); Wire.write(value | 8); Wire.endTransmission(); }
void nibble(byte value) { expander(value | 4); delayMicroseconds(2); expander(value & ~4); delayMicroseconds(50); }
void lcdByte(byte value, bool data=false) { byte rs=data?1:0; nibble((value & 0xf0)|rs); nibble((value << 4)|rs); }
void text(const char* value) { while(*value) lcdByte(*value++,true); }
void setup() {
  Wire.begin(); delay(50);
  nibble(0x30); delay(5); nibble(0x30); delay(5); nibble(0x30); nibble(0x20);
  lcdByte(0x28); lcdByte(0x0c); lcdByte(0x06); lcdByte(0x01); delay(2);
  lcdByte(0x80); text("CIRCUIT FORGE");
}
void loop() { lcdByte(0xc0); text("Seconds: "); char value[12]; ultoa(millis()/1000,value,10); text(value); delay(100); }
`;
    w.libraries = '';
  }
  if (id === 'distance-servo') {
    w.instances.push({
      id: 'servo',
      name: 'Servo',
      kind: 'module',
      modelId: 'module-servo',
      transform: { x: 55, y: 90, rot: 0 },
    });
    wire(pin('uno', 'D9'), pin('servo', 'PWM'));
    wire(hole('3-T-'), pin('servo', 'GND'), '#293440');
    wire(hole('3-T+'), pin('servo', 'V+'), '#d74748');
    w.firmware =
      '#include <Servo.h>\nServo motor;\n' +
      w
        .firmware!.replace(
          '  Serial.begin(115200);',
          '  motor.attach(9);\n  Serial.begin(115200);',
        )
        .replace(
          '  delay(100);',
          '  if (echo) motor.write(echo / 58.0 < 30 ? 0 : 90);\n  delay(100);',
        );
    w.libraries = 'Servo\n';
    w.lesson =
      'Change the distance input. At less than 30 cm, the sketch commands 0°; otherwise it commands 90°. Physical servos need a suitable external supply and common ground.';
  }
  return captureTarget(w, lookupModel);
}
