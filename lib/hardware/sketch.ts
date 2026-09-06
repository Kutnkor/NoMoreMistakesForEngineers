import type { HardwarePlan, FilterTransfer } from './types.ts';

const ident = (value: string) => 'cf_' + value.replace(/[^a-zA-Z0-9_]/g, '_');
export function generateSketch(
  plan: HardwarePlan,
  filter?: FilterTransfer | null,
  options: { interactive?: boolean; simulatedOled?: boolean } = {},
): string {
  if (!plan.canGenerate || !plan.board.profile)
    throw new Error("Resolve the plan's errors first.");
  const profile = plan.board.profile;
  const pot = options.interactive
    ? plan.items.find((i) => i.component.id === 'pot-10k')
    : undefined;
  const potPin = pot ? ident(pot.selection.id) + '_OUT' : null;
  const adcMax = profile.adc === 'esp32' ? 4095 : 1023;
  const pin = (p: string) =>
    profile.codePins?.[p] ??
    (/^D\d+$/.test(p) && profile.adc !== 'esp32' ? p.slice(1) : p);
  const headers = new Set<string>(['Arduino.h']);
  const globals: string[] = [],
    setup: string[] = [],
    updates: string[] = [],
    samples: string[] = [];
  const print = (key: string, expression: string) =>
    `  Serial.print(F(",\\"${key}\\":")); printNumber(${expression});`;
  if (
    plan.items.some((i) => i.component.interface.toUpperCase().includes('I2C'))
  ) {
    headers.add('Wire.h');
    if (profile.i2cSetup === 'esp32')
      setup.push(
        `  Wire.begin(${pin(profile.i2c.sda)}, ${pin(profile.i2c.scl)});`,
      );
    else if (profile.i2cSetup === 'rp2040')
      setup.push(
        `  Wire.setSDA(${pin(profile.i2c.sda)}); Wire.setSCL(${pin(profile.i2c.scl)}); Wire.begin();`,
      );
    else setup.push('  Wire.begin();');
  }
  for (const item of plan.items) {
    const c = item.component,
      t = c.template!,
      id = ident(item.selection.id),
      addr =
        '0x' +
        (item.selection.address ?? c.addresses[0] ?? 0)
          .toString(16)
          .toUpperCase();
    const P = (signal: string) => `${id}_${signal}`;
    for (const [signal, p] of Object.entries(item.pins))
      if (!['SDA', 'SCL'].includes(signal))
        globals.push(`const uint8_t ${P(signal)} = ${pin(p)};`);
    switch (t) {
      case 'led':
        setup.push(`  pinMode(${P('ANODE')}, OUTPUT);`);
        updates.push(
          potPin
            ? `  digitalWrite(${P('ANODE')}, analogRead(${potPin}) > ${Math.floor(adcMax / 2)}); // Pot threshold; 1k series resistor`
            : `  digitalWrite(${P('ANODE')}, (millis() / 500) % 2); // 1k series resistor`,
        );
        samples.push(
          print(
            id + '_on',
            potPin
              ? `analogRead(${potPin}) > ${Math.floor(adcMax / 2)} ? 1 : 0`
              : '(millis() / 500) % 2',
          ),
        );
        break;
      case 'rgb':
        for (const s of ['R', 'G', 'B'])
          setup.push(`  pinMode(${P(s)}, OUTPUT);`);
        updates.push(
          `  analogWrite(${P('R')}, 32); analogWrite(${P('G')}, 80); analogWrite(${P('B')}, 128); // common cathode, 1k per channel`,
        );
        break;
      case 'button':
        globals.push(
          `bool ${id}_last = HIGH, ${id}_stable = HIGH; unsigned long ${id}_changed = 0;`,
        );
        setup.push(`  pinMode(${P('SIGNAL')}, INPUT_PULLUP);`);
        updates.push(
          `  bool ${id}_now = digitalRead(${P('SIGNAL')});\n  if (${id}_now != ${id}_last) ${id}_changed = millis();\n  if (millis() - ${id}_changed >= 30) ${id}_stable = ${id}_now;\n  ${id}_last = ${id}_now;`,
        );
        samples.push(print(id + '_pressed', `${id}_stable == LOW ? 1 : 0`));
        break;
      case 'analog':
      case 'filter':
        samples.push(
          print(id + '_raw', `analogRead(${P('OUT')})`),
          print(id + '_volts', `readVolts(${P('OUT')})`),
        );
        break;
      case 'tmp36':
        samples.push(
          print(id + '_celsius', `(readVolts(${P('OUT')}) - 0.5f) * 100.0f`),
        );
        break;
      case 'lm35':
        samples.push(print(id + '_celsius', `readVolts(${P('OUT')}) * 100.0f`));
        break;
      case 'piezo':
        globals.push(`unsigned long ${id}_lastTone = 0;`);
        updates.push(
          `  if (millis() - ${id}_lastTone >= 2000) { ${id}_lastTone = millis(); tone(${P('SIGNAL')}, 440, 30); }`,
        );
        break;
      case 'hcsr04':
        setup.push(
          `  pinMode(${P('TRIG')}, OUTPUT); pinMode(${P('ECHO')}, INPUT); digitalWrite(${P('TRIG')}, LOW);`,
        );
        samples.push(
          `  digitalWrite(${P('TRIG')}, LOW); delayMicroseconds(2);\n  digitalWrite(${P('TRIG')}, HIGH); delayMicroseconds(10); digitalWrite(${P('TRIG')}, LOW);\n  unsigned long ${id}_us = pulseIn(${P('ECHO')}, HIGH, 25000UL);`,
          print(id + '_cm', `${id}_us ? ${id}_us * 0.0343f / 2.0f : NAN`),
        );
        break;
      case 'bme280':
        headers.add('Adafruit_BME280.h');
        globals.push(`Adafruit_BME280 ${id}; bool ${id}_ready = false;`);
        setup.push(`  ${id}_ready = ${id}.begin(${addr}, &Wire);`);
        samples.push(
          print(id + '_celsius', `${id}_ready ? ${id}.readTemperature() : NAN`),
          print(id + '_humidity', `${id}_ready ? ${id}.readHumidity() : NAN`),
          print(
            id + '_hpa',
            `${id}_ready ? ${id}.readPressure() / 100.0f : NAN`,
          ),
        );
        break;
      case 'bmp280':
        headers.add('Adafruit_BMP280.h');
        globals.push(`Adafruit_BMP280 ${id}; bool ${id}_ready = false;`);
        setup.push(`  ${id}_ready = ${id}.begin(${addr});`);
        samples.push(
          print(id + '_celsius', `${id}_ready ? ${id}.readTemperature() : NAN`),
          print(
            id + '_hpa',
            `${id}_ready ? ${id}.readPressure() / 100.0f : NAN`,
          ),
        );
        break;
      case 'ads1115':
        headers.add('Adafruit_ADS1X15.h');
        globals.push(`Adafruit_ADS1115 ${id}; bool ${id}_ready = false;`);
        setup.push(
          `  ${id}_ready = ${id}.begin(${addr}); ${id}.setGain(GAIN_TWOTHIRDS);`,
        );
        samples.push(
          print(
            id + '_a0_volts',
            `${id}_ready ? ${id}.computeVolts(${id}.readADC_SingleEnded(0)) : NAN`,
          ),
        );
        break;
      case 'mcp4725':
        headers.add('Adafruit_MCP4725.h');
        globals.push(`Adafruit_MCP4725 ${id}; bool ${id}_ready = false;`);
        setup.push(
          `  ${id}_ready = ${id}.begin(${addr});\n  if (${id}_ready) ${id}.setVoltage(0, false); // Start at 0 V; do not write EEPROM`,
        );
        samples.push(print(id + '_ready', `${id}_ready ? 1 : 0`));
        break;
      case 'ssd1306':
        headers.add('Adafruit_SSD1306.h');
        globals.push(
          `Adafruit_SSD1306 ${id}(128, 64, &Wire, ${options.simulatedOled ? '-1' : P('RESET')}); bool ${id}_ready = false;`,
        );
        setup.push(
          `  ${id}_ready = ${id}.begin(SSD1306_SWITCHCAPVCC, ${addr});`,
        );
        samples.push(
          `  if (${id}_ready) { ${id}.clearDisplay(); ${id}.setTextSize(1); ${id}.setTextColor(SSD1306_WHITE); ${id}.setCursor(0,0); ${id}.println(F("CIRCUIT FORGE")); ${id}.print(F("Uptime: ")); ${id}.print(millis()/1000); ${id}.println(F(" s")); ${id}.display(); }`,
          print(id + '_ready', `${id}_ready ? 1 : 0`),
        );
        if (potPin)
          samples.push(
            `  if (${id}_ready) { ${id}.setCursor(0,32); ${id}.print(F("Pot: ")); ${id}.print(analogRead(${potPin})); ${id}.display(); }`,
          );
        break;
      case 'ds3231':
        headers.add('RTClib.h');
        globals.push(`RTC_DS3231 ${id}; bool ${id}_ready = false;`);
        setup.push(
          `  ${id}_ready = ${id}.begin(); // Clock is never silently reset`,
        );
        samples.push(
          `  Serial.print(F(",\\"${id}_unix\\":"));\n  if (${id}_ready && !${id}.lostPower()) Serial.print((uint32_t)${id}.now().unixtime()); else Serial.print(F("null"));`,
        );
        break;
      case 'mpu6050':
        headers.add('Adafruit_MPU6050.h');
        globals.push(`Adafruit_MPU6050 ${id}; bool ${id}_ready = false;`);
        setup.push(`  ${id}_ready = ${id}.begin(${addr}, &Wire);`);
        samples.push(
          `  sensors_event_t ${id}_a, ${id}_g, ${id}_t;\n  if (${id}_ready) ${id}.getEvent(&${id}_a, &${id}_g, &${id}_t);`,
          print(id + '_ax_mps2', `${id}_ready ? ${id}_a.acceleration.x : NAN`),
          print(id + '_gy_rads', `${id}_ready ? ${id}_g.gyro.y : NAN`),
        );
        break;
      case 'vl53l0x':
        headers.add('Adafruit_VL53L0X.h');
        globals.push(`Adafruit_VL53L0X ${id}; bool ${id}_ready = false;`);
        setup.push(`  ${id}_ready = ${id}.begin(${addr});`);
        samples.push(
          `  VL53L0X_RangingMeasurementData_t ${id}_reading;\n  if (${id}_ready) ${id}.rangingTest(&${id}_reading, false);`,
          print(
            id + '_mm',
            `${id}_ready && ${id}_reading.RangeStatus == 0 ? ${id}_reading.RangeMilliMeter : NAN`,
          ),
        );
        break;
      case 'dht22':
        headers.add('DHT.h');
        globals.push(`DHT ${id}(${P('DATA')}, DHT22);`);
        setup.push(`  ${id}.begin();`);
        samples.push(
          print(id + '_celsius', `${id}.readTemperature()`),
          print(id + '_humidity', `${id}.readHumidity()`),
        );
        break;
      case 'ds18b20':
        headers.add('OneWire.h');
        headers.add('DallasTemperature.h');
        globals.push(
          `OneWire ${id}_wire(${P('DATA')}); DallasTemperature ${id}(&${id}_wire);`,
        );
        setup.push(`  ${id}.begin();`);
        samples.push(
          `  ${id}.requestTemperatures();\n  float ${id}_temp = ${id}.getTempCByIndex(0);`,
          print(
            id + '_celsius',
            `${id}_temp == DEVICE_DISCONNECTED_C ? NAN : ${id}_temp`,
          ),
        );
        break;
      case 'servo':
        headers.add('Servo.h');
        globals.push(`Servo ${id};`);
        setup.push(
          `  ${id}.attach(${P('SIGNAL')}); ${id}.write(90); // External servo supply; initial motion to midpoint`,
        );
        break;
    }
  }
  const warnings = plan.issues
    .map((i) => ` * ${i.severity.toUpperCase()}: ${i.text}`)
    .join('\n');
  const connections = plan.wires
    .map(
      (w) =>
        ` * ${w.itemId}.${w.signal} -> ${w.boardPin}${w.note ? ' | ' + w.note : ''}`,
    )
    .join('\n');
  const interval = plan.items.some((i) => i.component.template === 'dht22')
    ? 2500
    : plan.items.some((i) => i.component.template === 'ds18b20')
      ? 1000
      : 250;
  const adcSetup =
    profile.adc === 'set10'
      ? '  analogReadResolution(10);'
      : profile.adc === 'esp32'
        ? '  analogReadResolution(12); // analogReadMilliVolts handles voltage conversion'
        : '';
  const volts =
    profile.adc === 'esp32'
      ? '  return analogReadMilliVolts(pin) / 1000.0f;'
      : `  return analogRead(pin) * (ADC_REFERENCE_VOLTS / 1023.0f);`;
  return `/*\n * CIRCUIT FORGE / Embedded Studio v4.0\n * Board: ${plan.board.name}\n * FQBN: ${profile.fqbn}\n * Generated source, not uploaded or hardware-tested.\n * Install libraries through Arduino IDE Library Manager: ${plan.libraries.join(', ') || 'No additional libraries'}\n * Digital/analog pin names refer to header labels; confirm board revision.\n${connections}\n${warnings}\n * Analog voltage uses nominal reference unless calibrated by the core.\n * Sensor values are demonstrations; calibrate against a reference instrument.\n${filter ? ` * Imported Sallen-Key: R1=${filter.r1} ohm, R2=${filter.r2} ohm, C1=${filter.c1} F, C2=${filter.c2} F\n * This low-rate logger does NOT measure a Bode response or prove filter bandwidth.\n` : ''} */\n\n${[...headers].map((h) => `#include <${h}>`).join('\n')}\n#include <math.h>\n\nconst float ADC_REFERENCE_VOLTS = ${profile.adcReference.toFixed(3)}f; // Measure the actual reference for precision\n${globals.join('\n')}\nunsigned long lastSample = 0;\nconst unsigned long SAMPLE_INTERVAL_MS = ${interval}UL;\n\nfloat readVolts(uint8_t pin) {\n${volts}\n}\nvoid printNumber(double value) {\n  if (isnan(value) || isinf(value)) Serial.print(F("null"));\n  else Serial.print(value, 3);\n}\n\nvoid setup() {\n  Serial.begin(115200);\n${adcSetup}\n${setup.join('\n')}\n}\n\nvoid loop() {\n${updates.join('\n')}\n  if (millis() - lastSample < SAMPLE_INTERVAL_MS) return;\n  lastSample = millis();\n  Serial.print(F("{\\"ms\\":")); Serial.print(millis());\n${samples.join('\n')}\n  Serial.println(F("}"));\n}\n`;
}

export function wiringMarkdown(
  plan: HardwarePlan,
  filter?: FilterTransfer | null,
): string {
  return `# CIRCUIT FORGE — Arduino wiring plan

Board: ${plan.board.name}
Logic: ${plan.board.logicVoltage ?? 'Not verified'} V
Source: ${plan.board.sourceUrl}

This output is a schematic pin plan, not a physical pin layout or hardware validation.

| Module | Signal | Board pin / bus | Note |
|---|---|---|---|
${plan.wires.map((w) => `| ${w.itemId} | ${w.signal} | ${w.boardPin} | ${w.note ?? ''} |`).join('\n')}

## Checks

${plan.issues.map((i) => `- ${i.severity.toUpperCase()}: ${i.text}`).join('\n')}

## Parts and sources

${plan.items
  .map(
    (i) => `- ${i.component.name}: ${i.component.sourceUrl}
  Additional parts: ${i.component.requires.join('; ') || 'See the catalog notes.'}
  Notes: ${i.component.notes.join(' ')}`,
  )
  .join('\n')}

## Arduino IDE

1. Install the board core from Board Manager.
2. Libraries: ${plan.libraries.join(', ') || 'No additional libraries.'}
3. The downloaded sketch folder and .ino file must have the same name.
4. Select the correct board and compile with Verify; after wiring, select the correct port and upload.
5. Serial communication: 115200 baud, one JSON object per line.
${filter ? '\n## Imported filter\n\n' + JSON.stringify(filter, null, 2) + '\nSlow ADC logging is not a frequency-response measurement. Keep the input signal within ADC limits.\n' : ''}`;
}
