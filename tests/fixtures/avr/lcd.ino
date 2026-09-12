// Built-in Wire library; PCF8574T backpack at 0x27, 4-bit write mode.
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
