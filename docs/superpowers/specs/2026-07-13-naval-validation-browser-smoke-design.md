# Deniz Doğrulama ve Browser Smoke Tasarımı

## Amaç

Mevcut deniz sistemi davranışını değiştirmeden doğrulama zincirini temiz kurulumda tekrar üretilebilir hale getirmek ve Netlify tarafından gerçekten yayınlanan, Firebase'den tamamen yalıtılmış bir production browser smoke giriş noktası sağlamak.

## Sınırlar

- Oyun politikası, savaş transaction'ları, pathfinding ve animasyon kuralları yeniden yazılmayacak.
- TerrainMapEditor yalnız stres testi bir yarış durumunu yeniden üretirse değiştirilecek.
- Smoke giriş noktası `App.jsx`, Firebase config veya room service import etmeyecek.
- Sentetik fixture yalnız mevcut saf oyun fonksiyonlarını ve gerçek UI bileşenlerini besleyecek; kuralları yeniden uygulamayacak.
- Hosting manuel deploy edilmeyecek. Netlify'ın Git push sonrasındaki otomatik deployment'ı beklenecek.

## Bağımlılık ve komut modeli

`firebase-tools` Java 17 ile uyumlu son 14.x sürümüne tam sürümle sabitlenecek. `test:rules`, `npx --no-install firebase-tools` kullanarak yalnız yerel lockfile binary'sini çalıştıracak. Browser suite tam sürümü sabitlenmiş `@playwright/test` ile, önceden üretilmiş `dist` üzerinde Vite preview başlatacak.

## Production smoke girişi

Vite multi-page input listesi hem ana uygulama `index.html` dosyasını hem `test/browser/naval-policy-smoke.html` dosyasını içerecek. Böylece nested HTML ve onun JSX/module graph'ı Vite tarafından bundle edilip `dist/test/browser/naval-policy-smoke.html` olarak üretilecek.

Harness her senaryoyu bağımsız çalıştıracak, süre ve hata bilgisini ayrı bir sonuç satırında saklayacak. Genel `<output id="smoke-result">` yalnız bütün zorunlu senaryolar geçtiğinde `data-status="pass"` olacak. Harness ağ API'lerini yüklemeden ve Firebase modüllerini import etmeden çalışacak.

## Browser otomasyonu

Playwright üç Chromium projesi kullanacak:

- 1440×900 masaüstü;
- 390×844, touch ve mobile context açık mobil;
- gerçek `prefers-reduced-motion: reduce` media emulation kullanan reduced-motion proje.

Suite Vite preview'ı başlatıp koşu sonunda kapatacak, `data-status` ve senaryo satırlarını koşula bağlı bekleyecek ve başarısızlıkta screenshot/trace tutacak. Ağ gözlemi Firebase/Firestore isteklerini ve yazım metodlarını yasaklayacak.

## Flakiness kararı

Debounced autosave, manual save ve close-flush testleri birlikte en az 10 ardışık kez çalıştırılacak. Başarısızlık yoksa timeout veya üretim kodu değişikliği yapılmayacak. Yeniden üretilebilir hata oluşursa hata mesajı, pending promise ve fake timer sırası izlenerek yalnız kök neden düzeltilecek.

## Kabul ölçütleri

- Temiz `npm ci` sonrasında altı zorunlu komut sırasıyla geçer.
- Dist içinde nested smoke HTML vardır ve hashed production asset'lerini yükler.
- 15 zorunlu sentetik senaryo ayrı ayrı pass olur.
- Mobil proje gerçek dar viewport ve touch context raporlar.
- Reduced-motion proje hareketli gemi yerine vurguyu doğrular.
- Push sonrası Netlify ana uygulama ve nested smoke sayfası güncel asset hash'iyle geçer; Firebase ağına istek/yazım yoktur.
