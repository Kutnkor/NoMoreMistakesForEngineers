# NoMoreMistakesForEngineers — CIRCUIT FORGE

Türkçe arayüzlü Arduino, ESP32 ve Pico bağlantı/kod çalışma alanı; Wokwi dışa aktarımı ve öğrenen elektronik filtre araştırma laboratuvarı.

## v5 — Breadboard Lab

`/breadboard`: gerçek 830 delik bağlantı modeli, 2D/3D görünüm, otomatik yerleştirme, bağımsız netlist doğrulaması, öğrenme ipuçları ve PNG/tek sayfa kurulum kılavuzu. Beş hazır filtre devresi, sürükleme, kablo çizme, döndürme, silme ve geri alma desteklenir. `/filter` içindeki seçili R/C tasarımı doğrudan aktarılır.

49 otomatik test ve ayrı gerçek tarayıcı etkileşimleri doğrulandı. Apple M4 / Metal testinde 3D sürükleme 119 FPS; bu bir cihaz ölçümüdür. Beş PDF kılavuzu birer sayfadır. Model, sınırlar ve tekrar çalıştırma: `research/BREADBOARD_METHODS.md`.

## v4 — yeni AI Laboratuvarı

`/lab` dört çalışan deney içerir: ideal/sonlu op-amp karşılaştırması, eğitilmiş 6 sınıflı arıza modeli, eşit simülasyon bütçesinde üç arama yönteminin karşılaştırması ve sentetik sensör/aliasing deneyi. Bütün yöntemler, sınırlar ve yeniden üretme ayrıntıları `research/LAB_METHODS.md` içindedir.

- Sonlu motor: gerçek ngspice 47 ile 30 devre × 401 frekans noktasında doğrulandı.
- Arıza sinir ağı: 1.200 ayrı sentetik test ölçümünde %98 top-1 doğruluk; belirsizleri yanlış sayınca %97,5.
- Bütçe AI: 30 karşılaştırmalı deney; standart GP iki koşulda, yeni yöntem bir koşulda daha yüksek ortalama test verimi buldu. Genel üstünlük iddiası yoktur.
- Wokwi: 5 kart ve 10 eşlenmiş modül türü; ZIP içinde kod, bağlantılar ve kütüphaneler.
- ESP32-DevKitC V4 ve Raspberry Pi Pico, gerçek ürün fotoğrafları ve ayrı pin/kod profilleriyle eklendi.

Wokwi paketleri kullanıcı tarafından Wokwi projesine eklenir; Site bulut simülatörünü kendi içinde çalıştırmaz. Fiziksel montaj gerekmiyor.

## Ürün fotoğrafları ve arayüz

47 kart ve 46 fiziksel bileşen için kaynaklı ürün fotoğrafları eklendi. Görseller public/products altında yerel WebP dosyalarıdır; çalışma sırasında dış sunucudan hotlink yüklenmez. Kaynak, fotoğrafçı/üretici, varyant eşleşmesi ve varsa lisans araştırması research/image-sources.json içindedir. Genel parçalar temsili olarak etiketlenir. Bosch BME280 makro fotoğrafı Laserlicht / Wikimedia Commons, CC BY-SA 4.0; büyütme penceresinde kaynak, lisans ve yeniden boyutlandırma bilgisi yer alır. Diğer görseller için doğrulanmamış açık lisans iddiası yapılmaz.

Fotoğraflar kart seçiminde, bileşen kataloğunda, parça listesinde ve bağlantı masasında bulunur. Masadaki hatlar mantıksal pin eşleştirmesidir; fotoğraftaki deliklere fiziksel kablo takıldığı iddiası yoktur. Gerçek kablolama için pin tablosu ve ürün belgesi esas alınır.

## Arduino Studio

Ana sayfada kartını seç, bileşenleri ekle ve bağlantı haritasını incele. Plan, pin kapasitesi, I²C adresleri, temel lojik gerilimi ve desteklenen şablonların bazı kaynak çakışmalarını denetler. Kod sekmesinden CircuitForge.ino indir; Arduino IDE ile derleyip yükle. Uygulama kodu tarayıcıdan karta yüklemez. Web Serial bulunan masaüstü tarayıcılarda, kullanıcının seçtiği porttan gerçek JSON telemetrisi okunabilir.

- 45 resmî Arduino kartı + ESP32-DevKitC V4 + Raspberry Pi Pico; toplam 47 kart, 12 ayrıntılı pin/kod profili.
- 46 bileşen + sanal Sallen–Key ölçüm arayüzü; 24 çalıştırılabilir modül şablonu, 6 yalnız parça listesi kaydı. Kalanlar kaynaklı katalog kaydıdır.
- Araştırma dosyaları: research/arduino-boards.json ve research/arduino-components.json. Tarih: 2026-09-05.
- Belirli Adafruit/SparkFun modülleri ile çıplak çipler birbirinin yerine geçmez. Katalog evrensel veya eksiksiz değildir; bir kartta profil olması her bileşen kombinasyonunun doğrulandığı anlamına gelmez.
- Plan başına en fazla 8 modül. Seri UART pinleri varsayılan dijital havuzdan ayrılır; aynı I²C hattı paylaşımlıdır. 32U4 A6+ dijital takma adları atama havuzuna alınmaz.
- Filtre AI /filter yolundadır. Seçili tasarım Arduino planına aktarılabilir; ADC örneği yavaş voltaj günlüğüdür, Bode ölçümü değildir.

### Yeni Wokwi / ESP32 / Pico doğrulaması

Wokwi CLI 0.26.1 ile **53/53 bağlantı dosyası** hata ve uyarı olmadan denetlendi (iki tür için bilgi düzeyinde belge durumu notu var). Arduino CLI 1.5.1 ile **33/33 yeni sketch** derlendi: UNO/ESP32/Pico tekil modüller ve beş kartın birleşik pot+LED+buton+OLED örnekleri. ESP32 3.3.11, Arduino-Pico 6.1.0, AVR 1.8.8. Tüm geçmiş ve kaynak belge notları `research/embedded-validation.json` ve `research/LAB_METHODS.md` içinde. Wokwi bulutunda yürütme ve fiziksel test yapılmadı.

`node scripts/generate-wokwi-matrix.ts <çıktı-klasörü>` ardından `scripts/validate-wokwi-matrix.py` matris, Wokwi CLI, Arduino CLI, config ve rapor yollarıyla süreci tekrarlar.

### Önceki Arduino doğrulaması

Arduino CLI 1.5.1 ile **34/34 derleme** başarılı: 9 kartta LED+pot+buton; UNO R3 üzerinde 24 destekli modül tekil olarak; BME280+OLED birlikte. Nano ESP32 pin/kod profili vardır ancak bu derleme matrisine dahil değildir. AVR 1.8.8, megaAVR 1.8.8, Renesas UNO 1.6.0 ve SAMD 1.8.14 kullanıldı. Sonuçlar research/arduino-compile-results.json içinde. Derleme; kablo, güç, heap RAM veya gerçek sensör ölçümlerinin doğrulandığını göstermez.

Matris sketchlerini üretmek için:

```sh
node scripts/generate-arduino-matrix.ts /tmp/cf-arduino-matrix
```

matrix.json içindeki her FQBN ve sketch klasörü için arduino-cli compile komutunu çalıştır. Sketch başlığındaki kütüphaneleri Library Manager ile kur; bağımlılıkları da yükle.

Bu sürümde 49 otomatik test; sayısal filtre doğruluğunu ve pin/adres/gerilim/kod üretimi hatalarını denetler.

## Filtre AI kullanımı

1. Geçirme/durdurma frekanslarını, bant sapması ve bastırma hedefini gir.
2. R ve C toleranslarını, yöntem başına aday bütçesini ve deney tohumunu seç.
3. **Optimizasyonu başlat** düğmesine bas.
4. Frekans yanıtı, devre şeması, öğrenme eğrisi ve alternatif tasarımları incele.
5. JSON deney raporunu, CSV deneme geçmişini ve seçili tasarımın SPICE netlistini indir.

Başlangıç devresi bir referanstır; AI sonucu değildir ve aramaya enjekte edilmez. Girdileri değiştirmek son tamamlanan raporu değiştirmez; yeni bir deney başlatmak gerekir. Kayıtlar tarayıcı belleğindedir: sayfayı kapatmadan önce deneyleri dışa aktar.

## Yerelde çalıştırma

Node.js 24 ve pnpm 11.19.0. GitHub kurulumu: [Türkçe yükleme rehberi](docs/GITHUB_KURULUM.tr.md).

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm typecheck
pnpm benchmark
pnpm build
```

Üretim çıktısı `dist/client/` altında statik dosyalardır. Hesaplama bir Web Worker içinde yürütülür. API anahtarı, sunucu hesabı veya donanım gerekmez. Bu uygulama OpenAI API'sine istek göndermez; kullanılan AI yöntemleri Gaussian-process Bayesçi optimizasyon, öğrenilmiş bütçe tahsisi ve ayrı eğitilmiş arıza sinir ağıdır.

## Bilimsel model

Birim kazançlı ideal Sallen–Key alçak geçiren filtre:

- R1: giriş → a
- R2: a → b
- C1: a → çıkış
- C2: b → toprak
- İdeal tampon: çıkış = b, sonsuz giriş empedansı, sıfır çıkış empedansı

`H(s) = 1 / [1 + s*C2*(R1+R2) + s²*R1*R2*C1*C2]`

Geçirme bandında mutlak kazanç sapması ve durdurma bandında en düşük bastırma hesaplanır. Rezonans tepesi analitik olarak kontrol edilir; yalnızca frekans uç noktaları kontrol edilmez. f0 doğal frekanstır, her devrede -3 dB kesim frekansı değildir.

- Direnç aralığı: 1–100 kΩ; kondansatör aralığı: 1–100 nF.
- Aday değerleri değerlendirmeden önce E24'e yuvarlanır. Bu yuvarlama, parçaların stokta olduğu anlamına gelmez.
- R/C sapmaları birbirinden bağımsız ve belirtilen aralıkta uniform kabul edilir.
- Arama skoru: 48 sabit eğitim toleransı üzerindeki en büyük normalize bant ihlalinin nearest-rank %95 yüzdeliği. Düşük daha iyi; negatif değer, çekilişlerin en az %95'inde her iki kısıtın sağlandığını gösterir.
- Gaussian process: 4 normalize log-bileşen koordinatı, Matérn 5/2, sabit lengthscale 0.38, 1e-6 diagonal jitter, asinh skor dönüşümü, standardizasyon; expected improvement ile sonlu aday havuzundan seçim.
- Her iki yöntem aynı 8 Latin hiperküp başlangıcını, tolerans çekilişlerini ve değerlendirme bütçesini kullanır. Rastgele yöntem log uzayında uniform örnekler.
- En iyi üç AI adayı ve en iyi rastgele aday eğitim skoruna göre seçilir. Test sonuçları seçimi veya aramayı etkilemez.
- Bağımsız test: 1.024 yeni tolerans çekilişi; %95 Wilson verim güven aralığı.
- Frekans grafiğindeki bant, her frekanstaki %5–95 yüzdelik aralığıdır; tüm eğriyi kapsayan eşzamanlı güven bandı veya garantili en kötü durum sınırı değildir.
- 16 köşe testi destekleyici kontroldür; iç tolerans uzayının tamamı için kanıt değildir.

## ngspice ile ilişki

Uygulamadaki AC değerlendirmesi kapalı form analitik modeldir. ngspice tarayıcıda çalıştırılmaz. Dışa aktarılan `.cir` dosyası ngspice'ta ayrıca çalıştırılabilir:

```sh
ngspice -b circuit-forge.cir
```

`/filter` netlistinde ideal tampon için birim kazançlı gerilim kontrollü kaynak kullanılır. `/lab` netlisti ayrıca tek kutuplu sonlu açık çevrim kazancını ve GBW'yi modeller; 12.030 noktada native ngspice ile karşılaştırılmıştır. Her iki modelde doyum, slew rate, gürültü, ESR ve parazitler yoktur. Simülasyon sonuçları fiziksel devre veya üretim doğrulaması değildir.

## Doğrulama

`tests/circuit.test.ts` bağımsız kompleks düğüm çözümüyle 80 devrede transfer fonksiyonunu karşılaştırır. Ayrıca Butterworth ve tolerans fikstürleri, rezonans, asimptotik davranış, Gaussian-process tahminleri, tohum tekrarlanabilirliği, eşit bütçeler ve geçersiz hedefler test edilir.

`research/benchmark.json`, önceden belirlenmiş 0–9 tohumlarıyla varsayılan hedeflerde 10 deney içerir. Tek topoloji ve sınırlı hedef kümesi genel üstünlük iddiasını desteklemez. Sonuçlar, bazı deneylerde rastgele aramanın kazanabildiğini açıkça korur. Skor ve tolerans verimi farklı ölçütlerdir; daha iyi eğitim skoru her zaman daha yüksek test verimi demek değildir.

## Kullanıcının veri paketi incelemesi

121.006 eğitim ve 15.948 doğrulama satırı salt okunur biçimde denetlendi. Kaynak dosyalar uygulamaya yüklenmedi ve bu haricî paketten model eğitilmedi. v4 arıza modeli ayrı üretilmiş sentetik veri kullanır. Şema, örtüşme ve formül uyumluluğu bulguları research/data-audit.md ve JSON raporunda. Son Claude çalışma dökümü sonlu op-amp modelini ortaya koydu; ideal-model karşı örnekleri yanlış etiket kanıtı değildir. Açıklanan modelle bağımsız hesap, önceki iki örneğin durdurma sınırını sağladığını gösteriyor. Özgün kaynak, aynı modelle tam bant denetimi ve devre bazında veri ayrımı gerekiyor.

## Son Claude çalışması

CIRCUIT FORGE projesinin son konuşması ve kullanıcının çalışma dökümü incelendi. 13 topoloji, maliyet/sıcaklık, KiCad netlist/BOM ve 41 test kaydı var; yeni veri üretimi görülen son kayıtta 320/520 parçada. Güncel kaynak arşivi, tamamlanmış veri, checkpoint ve benchmark sonuçları alınmadı. Bu özellikler mevcut Site motorunda etkin değildir. Bulgular, model farkı ve öncelikli düzeltmeler research/claude-review.md içinde.

## Araştırmayı sahiplenmek

Bu ilk sürüm AI yardımıyla geliştirilmiştir. Başvuruda kendi katkını doğru tarif etmek için modeli, hedef fonksiyonunu ve deney tasarımını öğren; yaptığın değişiklikleri ve nedenlerini bir araştırma günlüğüne kaydet. Uygulamayı tek başına geliştirdiğini veya donanımda doğruladığını iddia etme. Sonraki adımlar `research/ROADMAP.md` içindedir.

## Kaynaklar

- Texas Instruments, Analysis of the Sallen-Key Architecture: https://www.ti.com/lit/an/sloa024b/sloa024b.pdf (kapasitör etiketlerinin eşleşmesine dikkat).
- Rasmussen & Williams, Gaussian Processes for Machine Learning, Chapter 2: https://gaussianprocess.org/gpml/chapters/RW2.pdf
- Frazier, A Tutorial on Bayesian Optimization: https://arxiv.org/abs/1807.02811
- ngspice: https://ngspice.sourceforge.io/shared.html
- Üretilen uygulama çatısı: OpenAI Sites; arayüz bileşenleri: Shadcn/Base UI; simülasyon ve optimizasyon kodu: bu çalışma alanı.
