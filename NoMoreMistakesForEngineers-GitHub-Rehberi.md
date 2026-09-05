# Kutnkor / NoMoreMistakesForEngineers

GitHub hesabı: **Kutnkor**. Depo adı: **NoMoreMistakesForEngineers**. Uygulamanın içindeki çalışma alanının adı CIRCUIT FORGE olarak korunur.

## Depoyu aç

[GitHub'da yeni depo oluştur](https://github.com/new) sayfasında sahibi `Kutnkor`, adı `NoMoreMistakesForEngineers` olarak seç. Başlangıçta README, `.gitignore` veya lisans ekleme; bunların hepsi pakette var.

Depo açıklaması için:

> Browser-based electronics workbench with AI filter optimization, fault diagnosis, Arduino/ESP32/Pico exports and an interactive 3D breadboard.

Önerilen konular: `electronics`, `circuit-design`, `bayesian-optimization`, `arduino`, `esp32`, `raspberry-pi-pico`, `breadboard`, `typescript`, `threejs`, `engineering-education`.

## Bu bilgisayardaki hazırlanmış Git kopyasını gönder

Proje klasöründe Terminal aç ve çalıştır:

```sh
git push -u origin main
```

`origin`, `https://github.com/Kutnkor/NoMoreMistakesForEngineers.git` adresine ayarlanmıştır. Bu komut yalnız depo oluşturulduktan ve bilgisayarda GitHub kimlik doğrulaması tamamlandıktan sonra çalışır. Parola veya erişim anahtarını kaynak dosyalarına yazma. Depoyu oluşturduktan sonra bağlantısını Codex'e gönderebilirsin.

## ZIP'i başka bir bilgisayarda kullanıyorsan

ZIP'i aç. Klasörde `package.json`, `README.md` ve gizli `.github` klasörü birlikte bulunmalı. ZIP dosyasını GitHub'a tek dosya olarak yüklemek yerine içindeki kaynakları Git ile gönder:

```sh
cd NoMoreMistakesForEngineers
git init -b main
git add .
git commit -m "Initial release: Circuit Forge engineering workbench"
git remote add origin https://github.com/Kutnkor/NoMoreMistakesForEngineers.git
git push -u origin main
```

Git ilk commit için ad/e-posta isterse GitHub'daki kendi commit kimliğini ayarla. Bu bilgisayardaki hazırlanmış kopyada `Kutnkor` ve GitHub noreply adresi kullanılmıştır.

## Kurulum ve kontrol

Node.js 24 kurulu olmalı. Ardından:

```sh
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm dev
```

Üretim kontrolü için `pnpm check`; üretim sürümünü yerelde açmak için ardından `pnpm start`. Açılış adresi `http://127.0.0.1:4173`.

GitHub Actions, ilk yüklemeden sonra lint, TypeScript, testler, üretim derlemesi ve derlenmiş Worker kontrollerini çalıştırır. Yerelde geçmiş olması GitHub'da çalıştırılmış olduğu anlamına gelmez. İş akışı siteyi otomatik yayımlamaz.

## Paylaşım kapsamı

İngilizce README, Türkçe teknik belge, yöntemler, deney raporları, eğitim betikleri, model ve mevcut ürün görselleri pakettedir. Ham özel NPZ veri dosyaları, hesap anahtarları, özel Sites yayın ayarları ve bağımlılık klasörü pakete dahil değildir.

Kod için MIT lisansı hazırlanmıştır. Ürün fotoğraflarının hakları ayrı kalır; bütün fotoğraflar için açık lisans doğrulanmamıştır. Ayrıntılar `THIRD_PARTY_NOTICES.md` ve `research/image-sources.json` içindedir.

Başvuru metninde gerçek katkını, anlayıp tekrar çalıştırabildiğin deneyleri ve AI yardımını doğru anlat. Sentetik test sonucunu fiziksel devre başarısı gibi sunma.

Kaynak: [GitHub'ın mevcut kodu depoya ekleme rehberi](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github).
