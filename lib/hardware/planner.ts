import type {
  Board,
  Component,
  Selection,
  HardwarePlan,
  PlannedItem,
  Issue,
  Wire,
} from './types.ts';

export function planHardware(
  board: Board,
  components: Component[],
  selections: Selection[],
): HardwarePlan {
  const issues: Issue[] = [],
    wires: Wire[] = [],
    items: PlannedItem[] = [],
    used = new Set<string>(),
    addresses = new Map<number, string>();
  const profile = board.profile;
  const warn = (
    severity: Issue['severity'],
    code: string,
    text: string,
    itemId?: string,
  ) => issues.push({ severity, code, text, itemId });
  if (!profile)
    warn(
      'error',
      'BOARD_PROFILE',
      'This board is listed in the catalog. A verified profile for automatic pin assignment and code generation has not been added yet.',
    );
  if (selections.length > 8)
    warn(
      'error',
      'ITEM_LIMIT',
      'A plan supports up to 8 modules. Split larger systems into subcircuits.',
    );
  if (new Set(selections.map((s) => s.id)).size !== selections.length)
    warn('error', 'DUPLICATE_ID', 'Module IDs must be unique.');
  const i2cNeeded = selections.some((s) =>
    components
      .find((c) => c.id === s.componentId)
      ?.interface.toUpperCase()
      .includes('I2C'),
  );
  if (i2cNeeded && profile) {
    used.add(profile.i2c.sda);
    used.add(profile.i2c.scl);
  }
  function take(
    pool: string[],
    itemId: string,
    signal: string,
    role: Wire['role'],
  ): string | undefined {
    const pin = pool.find((p) => !used.has(p));
    if (!pin) {
      warn(
        'error',
        'PIN_CAPACITY',
        `${signal} has no free ${role === 'analog' ? 'analog' : role === 'pwm' ? 'PWM' : 'digital'} pins remaining.`,
        itemId,
      );
      return;
    }
    used.add(pin);
    wires.push({ itemId, signal, boardPin: pin, role });
    return pin;
  }
  for (const selection of selections) {
    const c = components.find((c) => c.id === selection.componentId);
    if (!c) {
      warn(
        'error',
        'UNKNOWN_PART',
        'Component not found in the catalog.',
        selection.id,
      );
      continue;
    }
    const item: PlannedItem = {
      selection,
      component: c,
      pins: {},
      power: null,
    };
    items.push(item);
    if (!c.template)
      warn(
        'error',
        'CATALOG_ONLY',
        `${c.name}: sources and compatibility information are available, but no executable code template is provided yet.`,
        selection.id,
      );
    if (
      board.logicVoltage &&
      c.logicMax !== null &&
      board.logicVoltage > c.logicMax + 0.05 &&
      c.interface !== 'Analog'
    )
      warn(
        'error',
        'LOGIC_LEVEL',
        `${c.name}: ${board.logicVoltage} V logic exceeds the ${c.logicMax} V input limit. Design the level-shifter connection separately.`,
        selection.id,
      );
    if (c.supplyRange) {
      const [lo, hi] = c.supplyRange;
      let voltage: number | null = null;
      if (
        board.logicVoltage &&
        board.logicVoltage >= lo &&
        board.logicVoltage <= hi
      )
        voltage = board.logicVoltage;
      else if (lo <= 3.3 && hi >= 3.3) voltage = 3.3;
      else if (lo <= 5 && hi >= 5 && board.logicVoltage === 5) voltage = 5;
      if (voltage !== null) item.power = `${voltage}V`;
      else
        warn(
          'warning',
          'EXTERNAL_RAIL',
          `${c.name}: ${lo}–${hi} V separate supply required; check the board's power pins.`,
          selection.id,
        );
    }
    if (c.externalPower)
      warn(
        'warning',
        'MOTOR_POWER',
        `${c.name}: do not power the load from GPIO or the board's small regulator. Use a suitable external supply and common GND.`,
        selection.id,
      );
    if (c.template === 'hcsr04' && board.logicVoltage !== 5)
      warn(
        'error',
        'ECHO_LEVEL',
        'HC-SR04 ECHO may output 5 V. A 3.3 V board needs a voltage divider/level shifter; this direct-wiring template is enabled only for 5 V boards.',
        selection.id,
      );
    if (c.template === 'lm35' && board.logicVoltage !== 5)
      warn(
        'error',
        'LM35_SUPPLY',
        'LM35 requires at least 4 V supply. This simple template is for 5 V boards; a 3.3 V system needs separately verified external power and input range.',
        selection.id,
      );
    if (c.interface.toUpperCase().includes('I2C')) {
      const address = selection.address ?? c.addresses[0];
      if (address === undefined)
        warn(
          'warning',
          'ADDRESS_UNKNOWN',
          `${c.name}: verify the address in the manufacturer's documentation.`,
          selection.id,
        );
      else if (!c.addresses.includes(address))
        warn(
          'error',
          'INVALID_ADDRESS',
          `${c.name}: the selected address has not been verified for this catalog entry.`,
          selection.id,
        );
      else if (addresses.has(address))
        warn(
          'error',
          'I2C_CONFLICT',
          `I²C 0x${address.toString(16).toUpperCase()} address conflict: ${addresses.get(address)} and ${c.name}. Change the address jumper or module.`,
          selection.id,
        );
      else addresses.set(address, c.name);
      if (profile && c.template) {
        item.pins.SDA = profile.i2c.sda;
        item.pins.SCL = profile.i2c.scl;
        wires.push(
          {
            itemId: selection.id,
            signal: 'SDA',
            boardPin: profile.i2c.sda,
            role: 'i2c',
          },
          {
            itemId: selection.id,
            signal: 'SCL',
            boardPin: profile.i2c.scl,
            role: 'i2c',
          },
        );
      }
    }
    for (const extra of c.additionalAddresses ?? []) {
      if (addresses.has(extra))
        warn(
          'error',
          'I2C_CONFLICT',
          `I²C 0x${extra.toString(16)} additional address conflict: ${c.name} and ${addresses.get(extra)}.`,
          selection.id,
        );
      else addresses.set(extra, c.name);
    }
    if (!profile || !c.template || c.template === 'passive') continue;
    const bind = (signal: string, role: 'digital' | 'analog' | 'pwm') => {
      const pin = take(
        role === 'analog'
          ? profile.analog
          : role === 'pwm'
            ? profile.pwm
            : profile.digital,
        selection.id,
        signal,
        role,
      );
      if (pin) item.pins[signal] = pin;
    };
    switch (c.template) {
      case 'led':
        bind('ANODE', 'digital');
        break;
      case 'rgb':
        bind('R', 'pwm');
        bind('G', 'pwm');
        bind('B', 'pwm');
        break;
      case 'button':
        bind('SIGNAL', 'digital');
        break;
      case 'analog':
      case 'tmp36':
      case 'lm35':
      case 'filter':
        bind('OUT', 'analog');
        break;
      case 'piezo':
        bind('SIGNAL', 'digital');
        break;
      case 'servo':
        bind('SIGNAL', 'digital');
        break;
      case 'ssd1306':
        bind('RESET', 'digital');
        break;
      case 'hcsr04':
        bind('TRIG', 'digital');
        bind('ECHO', 'digital');
        break;
      case 'dht22':
      case 'ds18b20':
        bind('DATA', 'digital');
        break;
    }
    if (c.template === 'filter')
      warn(
        'warning',
        'ANALOG_INPUT',
        'The filter output must stay between GND and the ADC input limit. Do not connect bipolar/negative signals directly; add biasing and protection if needed. The ideal op-amp model does not validate real supply limits.',
        selection.id,
      );
    if (c.template === 'analog')
      warn(
        'info',
        'DIVIDER_WIRING',
        `${c.name}: OUT is an analog input. Use the potentiometer wiper or the midpoint of the sensor + 10 kΩ divider; physical units require calibration.`,
        selection.id,
      );
    if (c.template === 'analog' && board.profile?.adc === 'esp32')
      warn(
        'warning',
        'ADC_RANGE',
        'ESP32 ADC range depends on the chip and attenuation setting. The potentiometer may saturate near its upper end; raw values and calibrated mV are reported separately.',
        selection.id,
      );
    if (c.template === 'led' || c.template === 'rgb')
      warn(
        'info',
        'LED_RESISTOR',
        `${c.name}: add a series 1 kΩ resistor to each LED channel; check total GPIO current limits in the board documentation.`,
        selection.id,
      );
    if (c.template === 'ds18b20' || c.template === 'dht22')
      warn(
        'info',
        'DATA_PULLUP',
        `${c.name}: add a 4.7 kΩ pull-up between DATA and the logic supply. Parasitic power is not used.`,
        selection.id,
      );
    if (
      c.template === 'piezo' &&
      items.filter((v) => v.component.template === 'piezo').length > 1
    )
      warn(
        'error',
        'TONE_RESOURCE',
        'This template supports only one passive piezo at a time; the tone() timer is shared.',
        selection.id,
      );
    if (c.template === 'servo' && profile.adc === 'esp32')
      warn(
        'error',
        'SERVO_CORE',
        'This Servo-library template has not been validated on ESP32. An ESP32-compatible servo driver is required.',
        selection.id,
      );
    // Ground and supply are explicitly schematic, not physical header pin positions.
    wires.push({
      itemId: selection.id,
      signal:
        c.template === 'led'
          ? 'CATHODE'
          : c.template === 'rgb'
            ? 'COMMON CATHODE'
            : 'GND',
      boardPin: 'GND',
      role: 'ground',
    });
    if (!['led', 'rgb', 'button', 'piezo', 'filter'].includes(c.template)) {
      const rail = c.externalPower ? 'EXTERNAL V+' : item.power;
      if (rail)
        wires.push({
          itemId: selection.id,
          signal: 'VCC / VIN',
          boardPin: rail,
          role: 'power',
          note: c.externalPower
            ? 'Share the reference with board GND.'
            : undefined,
        });
    }
  }
  if (items.filter((i) => i.component.template === 'hcsr04').length > 1)
    warn(
      'error',
      'ULTRASONIC_CROSSTALK',
      'Multiple HC-SR04 echoes interfere with each other. This timing template supports only one ultrasonic sensor.',
    );
  if (
    items.filter((i) => i.component.template === 'ssd1306').length > 1 &&
    board.mcu.includes('328')
  )
    warn(
      'error',
      'OLED_RAM',
      'Two OLED buffers fill the ATmega328P SRAM capacity. Use a larger board or one display.',
    );
  if (
    items.some((i) => i.component.template === 'ssd1306') &&
    board.profile?.adc === 'avr10'
  )
    warn(
      'warning',
      'OLED_MEMORY',
      'A 128×64 OLED allocates a 1,024-byte dynamic RAM buffer. Compilation reports do not include this heap usage; verify runtime memory with sensors separately.',
    );
  if (
    items.some((i) => i.component.template === 'servo') &&
    items.some((i) => i.component.template === 'rgb')
  )
    warn(
      'error',
      'TIMER_CONFLICT',
      'Servo and RGB PWM timers conflict on some boards. Use separate plans with this template.',
    );
  if (
    items.some((i) => i.component.template === 'piezo') &&
    items.some((i) => i.component.template === 'rgb')
  )
    warn(
      'error',
      'TIMER_CONFLICT',
      'tone() and RGB PWM timers may conflict depending on the board core. Use separate plans with this template.',
    );
  if (
    items.some((i) => i.component.template === 'ssd1306') &&
    items.filter((i) => i.component.library).length > 2 &&
    board.mcu.includes('328')
  )
    warn(
      'warning',
      'RAM_BUDGET',
      'The SSD1306 framebuffer uses 1,024 bytes. Additional sensors may push ATmega328P RAM toward its limit; check the IDE compilation report.',
    );
  if (i2cNeeded)
    warn(
      'info',
      'I2C_PULLUPS',
      "The plan uses the board's default Wire/header I²C bus. Qwiic or a second Wire bus may differ. Check pull-up voltage and total pull-up resistance.",
    );
  return {
    board,
    items,
    wires,
    issues,
    libraries: [
      ...new Set(
        items.map((i) => i.component.library).filter((v): v is string => !!v),
      ),
    ],
    canGenerate:
      !!profile &&
      items.some(
        (i) => i.component.template && i.component.template !== 'passive',
      ) &&
      !issues.some((i) => i.severity === 'error'),
    usedPins: [...used],
    unsupported: items.filter((i) => !i.component.template).length,
  };
}
