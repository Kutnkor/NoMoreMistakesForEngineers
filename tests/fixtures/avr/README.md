# Reproducible AVR fixtures

The adjacent sketches are original Circuit Forge test code (MIT). Their HEX
files were compiled on 2026-09-09 by https://hexi.wokwi.com/build, the public
compiler used by the official AVR8js demo. Target: Arduino UNO, ATmega328P,
16 MHz. Tests run these actual binaries offline, not a sketch-text parser.

Recompile by POSTing JSON `{ "sketch": "<contents of .ino>" }` to that endpoint
(or use Arduino IDE, Arduino UNO target, Export Compiled Binary). Commit both
source and new HEX; compiler/core version changes may affect byte output.

Arduino AVR core code linked into these binaries is LGPL-2.1-or-later; its
source/build definitions are https://github.com/arduino/ArduinoCore-avr.
The sketches plus this procedure permit modification and relinking using the
Arduino toolchain. Serial baud is 115200. No external libraries are needed.

The distance-servo and lcd fixtures were compiled on 2026-09-12 by the same
endpoint. They exercise Servo (LGPL-2.1-or-later,
https://github.com/arduino-libraries/Servo) and Wire (part of ArduinoCore-avr),
not external third-party libraries. The original sketches are alongside the
binaries. Tests check distance changes, echo pulse duration, servo pulse period
and two display rows including a changing timer.
