import {
  CPU,
  AVREEPROM,
  EEPROMMemoryBackend,
  avrInstruction,
  AVRIOPort,
  portBConfig,
  portCConfig,
  portDConfig,
  AVRTimer,
  timer0Config,
  timer1Config,
  timer2Config,
  AVRUSART,
  usart0Config,
  AVRADC,
  adcConfig,
  PinState,
} from 'avr8js';
import type { RuntimeCircuit, RuntimeFrame, RuntimeInputs } from './circuit.ts';

/** Validate Intel HEX records before allowing them into the 32 KiB flash. */
export function parseHex(hex: string): Uint16Array {
  const bytes = new Uint8Array(32768);
  let base = 0,
    eof = false,
    count = 0;
  for (const line of hex.trim().split(/\r?\n/)) {
    if (eof) throw Error('Unexpected data after HEX end record.');
    if (!/^:([0-9a-fA-F]{2})+$/.test(line))
      throw Error('Invalid Intel HEX record.');
    const r = Uint8Array.from(line.slice(1).match(/../g)!, (s) =>
      parseInt(s, 16),
    );
    if (r.length !== r[0] + 5 || r.reduce((a, b) => a + b, 0) % 256)
      throw Error('Invalid HEX length or checksum.');
    const address = (r[1] << 8) | r[2],
      type = r[3];
    if (type === 0) {
      const start = base + address;
      if (start + r[0] > bytes.length)
        throw Error('Firmware exceeds ATmega328P flash.');
      bytes.set(r.slice(4, -1), start);
      count += r[0];
    } else if (type === 1 && r[0] === 0) eof = true;
    else if ((type === 2 || type === 4) && r[0] === 2)
      base = ((r[4] << 8) | r[5]) * (type === 2 ? 16 : 65536);
    else if (!([3, 5].includes(type) && r[0] === 4))
      throw Error('Unsupported HEX record.');
  }
  if (!eof || !count) throw Error('Incomplete or empty firmware.');
  return new Uint16Array(bytes.buffer);
}

export class CircuitAVR {
  readonly cpu: CPU;
  readonly ports: AVRIOPort[];
  readonly adc: AVRADC;
  readonly usart: AVRUSART;
  private inputs: RuntimeInputs = { buttons: {}, pots: {} };
  private serial = '';
  private incoming: number[] = [];
  private high = new Float64Array(20);
  private levels = new Uint8Array(20);
  private since = 0;
  private frameStart = 0;
  private applying = false;
  readonly circuit: RuntimeCircuit;
  constructor(hex: string, circuit: RuntimeCircuit) {
    this.circuit = circuit;
    this.cpu = new CPU(parseHex(hex));
    new AVREEPROM(this.cpu, new EEPROMMemoryBackend(1024));
    this.ports = [
      new AVRIOPort(this.cpu, portDConfig),
      new AVRIOPort(this.cpu, portBConfig),
      new AVRIOPort(this.cpu, portCConfig),
    ];
    new AVRTimer(this.cpu, timer0Config);
    new AVRTimer(this.cpu, timer1Config);
    new AVRTimer(this.cpu, timer2Config);
    this.adc = new AVRADC(this.cpu, adcConfig);
    this.usart = new AVRUSART(this.cpu, usart0Config, 16e6);
    this.usart.onByteTransmit = (b) => {
      this.serial = (this.serial + String.fromCharCode(b)).slice(-16000);
    };
    for (const port of this.ports)
      port.addListener(() => {
        this.accumulate();
        this.sampleLevels();
        this.applyInputs();
      });
    this.applyInputs();
  }
  private port(pin: number) {
    return {
      port: this.ports[pin < 8 ? 0 : pin < 14 ? 1 : 2],
      bit: pin < 8 ? pin : pin < 14 ? pin - 8 : pin - 14,
    };
  }
  private accumulate() {
    const elapsed = this.cpu.cycles - this.since;
    for (let p = 0; p < 20; p++) this.high[p] += this.levels[p] * elapsed;
    this.since = this.cpu.cycles;
  }
  private sampleLevels() {
    for (let p = 0; p < 20; p++) {
      const { port, bit } = this.port(p);
      this.levels[p] = port.pinState(bit) === PinState.High ? 1 : 0;
    }
  }
  private applyInputs() {
    if (this.applying) return;
    this.applying = true;
    for (const b of this.circuit.buttons) {
      const { port, bit } = this.port(b.pin);
      if (port.pinState(bit) < PinState.Input) {
        this.applying = false;
        throw Error(
          'A button pin is configured as OUTPUT. Use INPUT_PULLUP before interacting.',
        );
      }
      port.setPin(
        bit,
        !this.inputs.buttons[b.id] &&
          port.pinState(bit) === PinState.InputPullUp,
      );
    }
    for (const p of this.circuit.pots) {
      const { port, bit } = this.port(p.channel + 14);
      if (port.pinState(bit) < PinState.Input) {
        this.applying = false;
        throw Error(
          'A potentiometer input is configured as OUTPUT. Keep the wiper pin as INPUT.',
        );
      }
      const value = Math.max(0, Math.min(1, this.inputs.pots[p.id] ?? 0.5));
      const voltage = 5 * (p.reverse ? 1 - value : value);
      this.adc.channelValues[p.channel] = voltage;
      port.setPin(bit, voltage >= 3);
    }
    this.applying = false;
  }
  setInputs(inputs: RuntimeInputs) {
    this.inputs = inputs;
    this.applyInputs();
  }
  sendSerial(text: string) {
    this.incoming.push(...new TextEncoder().encode(text.slice(0, 512)));
    this.incoming = this.incoming.slice(0, 4096);
  }
  step(cycles = 160000) {
    const end = this.cpu.cycles + cycles;
    while (this.cpu.cycles < end) {
      if (this.cpu.pc >= this.cpu.progMem.length)
        throw Error('Program counter left the supported flash range.');
      if (this.incoming.length && !this.usart.rxBusy && this.usart.rxEnable)
        this.usart.writeByte(this.incoming.shift()!);
      avrInstruction(this.cpu);
      this.cpu.tick();
    }
  }
  frame(): RuntimeFrame {
    this.accumulate();
    const elapsed = Math.max(1, this.cpu.cycles - this.frameStart);
    const leds: Record<string, number> = {};
    for (const l of this.circuit.leds) {
      const { port, bit } = this.port(l.pin),
        output = port.pinState(bit) < PinState.Input;
      const duty = output
        ? l.activeLow
          ? 1 - this.high[l.pin] / elapsed
          : this.high[l.pin] / elapsed
        : 0;
      // Brightness uses a nominal 2 V red LED drop, not a SPICE diode model.
      leds[l.id] = Math.min(1, 330 / l.resistance) * duty;
    }
    leds[this.circuit.boardId] = this.high[13] / elapsed;
    const frame = {
      inputs: this.inputs,
      milliseconds: this.cpu.cycles / 16000,
      leds,
      pins: Array.from(this.levels),
      serial: this.serial,
      running: true,
    };
    this.high.fill(0);
    this.frameStart = this.cpu.cycles;
    return frame;
  }
}
