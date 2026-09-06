# Arduino Studio: kapsam ve kanıt

Araştırma tarihi: 5 Eylül 2026. Donanım satın alma veya fiziksel montaj gerekmeksizin katalog, planlama ve kod üretimi kullanılabilir. Gerçek seri veri için kullanıcının ayrıca uyumlu donanımı bağlaması gerekir.

## Uygulanan iş akışı

Kart → modüller → kaynak kontrolleri → pin tablosu/şematik → Arduino sketch → IDE doğrulama ve yükleme → gerçek seri telemetri.

Katalog verileri üreticilerin kart sayfaları, pinout belgeleri, bileşen kılavuzları ve resmî çekirdek tanımlarından araştırıldı. Her kaydın kaynağı bulunur. Veri sayfası araştırması makine öğrenimi eğitimi değildir. Arduino planlayıcı kurallıdır; Filtre AI ayrı Gaussian-process Bayesçi optimizasyon kullanır.

## Destek seviyeleri

- **Katalog:** araştırılmış kaynak ve elektrik bilgisi; otomatik devre kodu yok.
- **Parça listesi:** direnç/kondansatör ve destek parçaları; otomatik elektrik bağlantısı yok. Aktif modül eklendiğinde kod üretimini tek başına engellemez.
- **Kod + pin:** uygulanmış planlama/kod şablonu. Modülün belirtilen tam varyantı ve verilen ek parçalar esas alınır.
- **Derlendi:** yalnız kaydedilen 34 matris örneği. Nano ESP32 için bu doğrulama yapılmadı.
- **Fiziksel doğrulama:** bu çalışma kapsamında hiçbir devre fiziksel olarak denenmedi.

## Kontroller

Pin tekrarları ve pin kapasitesi, bazı ADC/dijital alias durumları, I²C ana adresleri ve PCA9685 ALLCALL, 5 V HC-SR04 ECHO, düşük gerilimli çıplak çip girişleri, bazı timer kaynakları, çift OLED SRAM gereksinimi ve ultrasonik çapraz konuşma kontrol edilir. Bu kontroller bütün kart/periferik/timer yapılandırmalarını modellemez. SPI cihazları otomatik kod kapsamına alınmadı.

Nominal ADC gerilim dönüşümü hassas ölçüm kalibrasyonu değildir. Nano ESP32 analogReadMilliVolts kullanır; S3 ADC tüm 3,3 V aralığını doğrusal olarak ölçmez. AVR RTC Unix zamanı float'a dönüştürülmeden uint32_t olarak yazılır. Başarısız sensör okumaları JSON null döndürür. SSD1306 RESET pinine ayrı pin atanır. Harici güç ve ek dirençler kullanıcı planında açıkça belirtilir.

## Tekrar üretilebilirlik

Kaynak: lib/hardware/{catalog,planner,sketch}.ts. Testler: tests/hardware.test.ts. Sketch matrisi: scripts/generate-arduino-matrix.ts. Derleme kanıtı: arduino-compile-results.json.

Daha büyük katalog; daha güçlü bir model, yeni araştırma veya tüm donanım kombinasyonlarının çalışacağı anlamına gelmez. Araştırma katkısı için yeni modül profilleri, bağımsız elektrik doğrulaması, gerçek ölçümle karşılaştırma ve bu değişikliklerin deney kaydı gerekir.
