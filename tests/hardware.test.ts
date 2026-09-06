import test from 'node:test';
import assert from 'node:assert/strict';
import { boards, components } from '../lib/hardware/catalog.ts';
import { planHardware } from '../lib/hardware/planner.ts';
import { generateSketch } from '../lib/hardware/sketch.ts';
const board = (id: string) => boards.find((b) => b.id === id)!;
const plan = (id: string, parts: string[]) =>
  planHardware(
    board(id),
    components,
    parts.map((componentId, i) => ({ id: 'm' + i, componentId })),
  );
const error = (p: ReturnType<typeof plan>, code: string) =>
  p.issues.some((i) => i.code === code && i.severity === 'error');
await test('catalog has unique IDs, primary source URLs, and finite electrical ranges', () => {
  assert.equal(new Set(boards.map((b) => b.id)).size, 47);
  assert.equal(new Set(components.map((c) => c.id)).size, 47);
  for (const x of [...boards, ...components])
    assert.equal(new URL(x.sourceUrl).protocol, 'https:');
  for (const c of components)
    if (c.supplyRange) assert.ok(c.supplyRange[0] <= c.supplyRange[1]);
});
await test('all twelve board profiles produce basic plans with canonical, distinct resource pins', () => {
  for (const b of boards.filter((b) => b.profile)) {
    const p = plan(b.id, ['led-red', 'pot-10k', 'pushbutton']);
    assert.equal(p.canGenerate, true, b.id);
    const pins = p.wires
      .filter((w) => ['digital', "analog", 'pwm'].includes(w.role))
      .map((w) => w.boardPin);
    assert.equal(new Set(pins).size, pins.length);
    assert.ok(!pins.includes('D0') && !pins.includes('D1'));
    assert.ok(generateSketch(p).includes('Serial.begin(115200)'));
  }
});
await test('5 V sonar and bare 3.3 V devices are gated on incompatible logic', () => {
  assert.ok(error(plan('nano-esp32', ['hcsr04-5v-sparkfun']), 'ECHO_LEVEL'));
  assert.ok(error(plan('uno-rev3', ['bme280-bare']), 'LOGIC_LEVEL'));
  assert.equal(plan('uno-rev3', ['hcsr04-5v-sparkfun']).canGenerate, true);
});
await test('shared I2C resources and address jumper alternatives are enforced', () => {
  let p = plan('uno-rev3', ['bme280-adafruit', 'bmp280-adafruit']);
  assert.ok(error(p, 'I2C_CONFLICT'));
  p = planHardware(board('uno-rev3'), components, [
    { id: 'a', componentId: 'bme280-adafruit', address: 0x76 },
    { id: 'b', componentId: 'bmp280-adafruit', address: 0x77 },
  ]);
  assert.equal(p.canGenerate, true);
  assert.equal(p.wires.filter((w) => w.signal === 'SDA').length, 2);
  assert.ok(
    error(
      plan('uno-rev3', ['mpu6050-adafruit', 'ds3231-adafruit']),
      'I2C_CONFLICT',
    ),
  );
});
await test('PCA9685 startup ALLCALL collides with TCA9548A in either order', () => {
  for (const a of [
    ['pca9685-adafruit', 'tca9548a-adafruit'],
    ['tca9548a-adafruit', 'pca9685-adafruit'],
  ])
    assert.ok(error(plan('uno-rev3', a), 'I2C_CONFLICT'));
});
await test('pin capacity, ultrasound crosstalk, timer and SRAM constraints gate sketch export', () => {
  assert.ok(error(plan('uno-rev3', Array(5).fill('led-red')), 'PIN_CAPACITY'));
  assert.ok(
    error(
      plan('uno-rev3', ['hcsr04-5v-sparkfun', 'hcsr04-5v-sparkfun']),
      'ULTRASONIC_CROSSTALK',
    ),
  );
  assert.ok(
    error(plan('uno-rev3', ['led-rgb-cc', 'piezo-passive']), 'TIMER_CONFLICT'),
  );
  const p = planHardware(board('uno-rev3'), components, [
    { id: 'a', componentId: 'ssd1306-adafruit-128x64', address: 0x3c },
    { id: 'b', componentId: 'ssd1306-adafruit-128x64', address: 0x3d },
  ]);
  assert.ok(error(p, 'OLED_RAM'));
});
await test('passive BOM parts do not manufacture pin plans; unsupported modules cannot emit code', () => {
  assert.equal(plan('uno-rev3', ['resistor']).canGenerate, false);
  assert.equal(plan('uno-rev3', ['resistor', 'led-red']).canGenerate, true);
  assert.ok(error(plan('uno-rev3', ['hobby-servo']), 'CATALOG_ONLY'));
  assert.throws(() => generateSketch(plan('uno-rev3', ['hobby-servo'])));
});
await test('analog dividers include rails and sensor-specific notes; OLED gets a reset pin', () => {
  for (const id of ['pot-10k', 'ldr', 'fsr', 'ntc-10k', 'flex-sensor']) {
    const p = plan('uno-rev3', [id]);
    assert.ok(p.wires.some((w) => w.role === 'power' && w.boardPin === '5V'));
    assert.ok(p.wires.some((w) => w.role === 'ground'));
    assert.ok(p.wires.some((w) => w.role === "analog"));
    assert.ok(p.items[0].component.notes.some((n) => n.includes('10 kΩ')));
  }
  const p = plan('uno-rev3', ['ssd1306-adafruit-128x64']);
  assert.ok(p.wires.some((w) => w.signal === 'RESET'));
  assert.match(
    generateSketch(p),
    /Adafruit_SSD1306 cf_m0\(128, 64, &Wire, cf_m0_RESET\)/,
  );
});
await test('AVR time precision, ADC conversion and renamed digital symbols are preserved', () => {
  const s = generateSketch(plan('uno-rev3', ['ds3231-adafruit']));
  assert.match(s, /Serial.print\(\(uint32_t\)cf_m0.now\(\).unixtime\(\)\)/);
  assert.ok(!s.includes('(double)'));
  const esp = generateSketch(plan('nano-esp32', ['led-red', 'pot-10k']));
  assert.match(esp, /= D2;/);
  assert.match(esp, /analogReadMilliVolts/);
  assert.match(
    generateSketch(plan('uno-r4-minima', ['pot-10k'])),
    /analogReadResolution\(10\)/,
  );
  assert.ok(
    !generateSketch(plan('uno-rev3', ['pot-10k'])).includes(
      'analogReadResolution',
    ),
  );
});
await test('invalid addresses and unknown module identities cannot silently pass', () => {
  let p = planHardware(board('uno-rev3'), components, [
    { id: 'a', componentId: 'bme280-adafruit', address: 0 },
  ]);
  assert.ok(error(p, 'INVALID_ADDRESS'));
  p = planHardware(board('uno-rev3'), components, [
    { id: 'a', componentId: 'missing' },
  ]);
  assert.ok(error(p, 'UNKNOWN_PART'));
});
