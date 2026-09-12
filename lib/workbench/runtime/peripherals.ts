/** PCF8574 mapping used by the documented LCD1602 I2C reference: RS,RW,E,BL,D4..D7. */
export class CharacterLCD {
  private memory = new Uint8Array(128).fill(32);
  private address = 0;
  private previous = 0;
  private nibble: number | null = null;
  private fourBit = false;
  private increment = true;
  private enabled = false;
  backlight = false;
  write(value: number) {
    this.backlight = !!(value & 8);
    if (this.previous & 4 && !(value & 4) && !(value & 2)) {
      const n = value >> 4;
      if (!this.fourBit) {
        if (n === 2) this.fourBit = true;
      } else if (this.nibble === null) this.nibble = n;
      else {
        const byte = (this.nibble << 4) | n;
        this.nibble = null;
        this.byte(byte, !!(value & 1));
      }
    }
    this.previous = value;
  }
  private byte(value: number, data: boolean) {
    if (data) {
      this.memory[this.address] = value;
      this.address = (this.address + (this.increment ? 1 : 127)) & 127;
    } else if (value === 1) {
      this.memory.fill(32);
      this.address = 0;
    } else if (value === 2) this.address = 0;
    else if (value & 128) this.address = value & 127;
    else if ((value & 248) === 8) this.enabled = !!(value & 4);
    else if ((value & 252) === 4) this.increment = !!(value & 2);
  }
  rows() {
    return [0, 64].map((start) =>
      this.enabled
        ? Array.from(this.memory.slice(start, start + 16), (b) =>
            b >= 32 && b <= 126 ? String.fromCharCode(b) : '·',
          ).join('')
        : ' '.repeat(16),
    );
  }
}
