void setup(){pinMode(9,OUTPUT);Serial.begin(115200);} void loop(){digitalWrite(9,HIGH);Serial.println("hello");delay(500);digitalWrite(9,LOW);delay(500);}
