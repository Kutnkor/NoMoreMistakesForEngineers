void setup() { pinMode(9, OUTPUT); pinMode(2, INPUT_PULLUP); Serial.begin(115200); }
void loop() {
  int value=analogRead(A0);
  int pressed=digitalRead(2)==LOW;
  analogWrite(9, pressed ? 255 : value/4);
  Serial.print(value); Serial.print(","); Serial.println(pressed);
  if(Serial.available()) { Serial.print("echo:"); Serial.println((char)Serial.read()); }
  delay(20);
}
