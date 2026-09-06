# CIRCUIT FORGE — araştırma planı

Çalışan prototip başlangıçtır. Temel araştırma sorusu:

> Aynı aday değerlendirme bütçesinde, toleransları hesaba katan Bayesçi optimizasyon elektronik filtre tasarımını hangi koşullarda iyileştirir?

## 1. Modeli öğren ve doğrula

- Devre şemasındaki C1 geri besleme bağlantısını ve C2 toprak bağlantısını açıkla.
- H(s), doğal frekans ve Q ilişkisini türet; -3 dB frekansından farkını göster.
- v4 sonlu model/ngspice karşılaştırmasını tekrarla: 30 devre, 12.030 frekans noktası. Düğüm denklemlerini kendin türet; sayısal model doğrulaması ile fiziksel geçerliliği ayır.
- Sonlu op-amp bant genişliği eklendi. Şimdi aynı tolerans çekilişleriyle idealde geçip sonluda kalan tasarımların oranını ölç; sonraki adım sonlu çıkış empedansı ve parasitikler.

## 2. Deneyi önceden tanımla

- Ayarlama için kullanılan tohumları, nihai test tohumlarından ayır.
- Örneğin farklı geçirme/durdurma oranları ve tolerans seviyeleri için hedef matrisi tanımla.
- Başarı ölçütlerini önceden yaz: hedef sağlayan aday oranı, test verimi, değerlendirme sayısı, gerçek çalışma süresi.
- Rastgele aramaya ek olarak analitik tasarım, düzenli tarama veya klasik optimizasyon tabanı ekle.
- Her yönteme aynı değerlendirme bütçesini ver; GP hesaplama maliyetini ayrıca raporla.

## 3. Kendi yöntemini geliştir

v4 bütçe yöntemi ve arıza modeli tamamlandı; mevcut sonuçlar research/LAB_METHODS.md içinde. Sonraki çalışmada tek bir soruya odaklan:

- Fizik bilgili bir Gaussian-process çekirdeği: f0 ve Q bilgisi aramayı iyileştirir mi?
- Toleransların birbirine bağlı olduğu durumda tasarım kalitesi ne kadar değişir?
- Farklı bileşen kataloglarında ayrık aday seçimi nasıl yapılmalı?
- Bir hedef üzerinde öğrenilen bilgiler yakın hedeflere taşınabilir mi?

## 4. Araştırmayı paylaşılabilir hale getir

- Bir veya iki elektronik öğrencisinden/öğretmeninden teknik geri bildirim al.
- Deney koşulları, başarısız sonuçlar, veriler ve kod sürümünü raporda birlikte tut.
- 2–4 sayfalık teknik rapor ve kısa bir demo hazırla.
- Yapay zekâ desteğini ve kendi kararlarını açıkça belgele. Kullanıcı, ödül, araştırma ortaklığı ve donanım testi gibi sonuçları yalnızca gerçekleştiğinde yaz.

Fiziksel montaj gerekli değildir; bu planın tüm araştırma ve doğrulama adımları yazılım üzerinden yürütülebilir.
