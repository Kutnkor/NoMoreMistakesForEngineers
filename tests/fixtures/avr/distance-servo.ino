#include <Servo.h>
Servo motor;
// Wokwi: change the sensor distance while the simulation runs.
void setup() {
  motor.attach(9);
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
  if (echo) motor.write(echo / 58.0 < 30 ? 0 : 90);
  delay(100);
}
