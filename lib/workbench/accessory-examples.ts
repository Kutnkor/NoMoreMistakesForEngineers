import { lookupModel } from './registry.ts';
import { captureTarget } from './target.ts';
import type { Workbench, ConnectionEndpoint } from './types.ts';

export const ACCESSORY_EXAMPLES = [
  {
    id: 'sonar',
    name: 'UNO distance sensor · Wokwi',
    modelId: 'module-hc-sr04',
  },
  { id: 'servo', name: 'UNO servo sweep · Wokwi', modelId: 'module-servo' },
  { id: 'lcd', name: 'UNO I²C LCD · Wokwi', modelId: 'module-lcd1602-i2c' },
] as const;

/** Export-ready reference wiring and sketches; peripherals run in Wokwi. */
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
  if (id === 'sonar') {
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
    w.firmware = `#include <Wire.h>
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
void setup() {
  lcd.init(); lcd.backlight();
  lcd.setCursor(0, 0); lcd.print("CIRCUIT FORGE");
}
void loop() {
  lcd.setCursor(0, 1); lcd.print("Seconds: "); lcd.print(millis() / 1000);
  delay(100);
}
`;
    w.libraries = 'LiquidCrystal I2C\n';
  }
  return captureTarget(w, lookupModel);
}
