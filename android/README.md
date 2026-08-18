# Age of Paper — Android

Kotlin ve Jetpack Compose ile yazılmış Android istemcisi. Arayüz, Claude Design
projesindeki **Telefon Arayüzü** tasarımını uygular: dört sekme yerine ekranın
altında evreye göre içeriği değişen tek bir emir kartı, üç adımlı savaş emri,
katman olarak açılan sohbet.

Web istemcisi (`../src`) hiç değişmedi. Bu klasör ona paralel ikinci bir
istemcidir ve aynı Firestore odalarını kullanır.

## Modüller

| Modül | İçerik |
|---|---|
| `core` | Saf Kotlin/JVM. `src/game` kural motorunun ve SVG içe aktarma zincirinin portu. Android bağımlılığı yok, JUnit ile test edilir. |
| `app` | Compose arayüzü, Firestore ve çevrimdışı demo repository'leri. |

### `core` neyi taşıyor

- **Kurallar:** evre makinesi, tur ilerletme, ekonomi, claim uygunluğu, pricing
  v2, seferberlik/savaş durumu, deterministik savaş, deniz politikası, katılma
  istekleri, harita doğrulama.
- **SVG zinciri:** sanitizasyon, `transform` zinciri birleştirme (tarayıcıdaki
  `getScreenCTM` yerine), path düzleştirme (`getPointAtLength` yerine), yüzey
  adayı çıkarımı, sınır tabanlı komşuluk, `terrain-grid-v2` negatif alan
  analizi, kanonik JSON + SHA-256 metadata, importer.

Tarayıcıya özgü ölçüm API'leri (`getBBox`, `getScreenCTM`, `getTotalLength`,
`getPointAtLength`) Kotlin'de yeniden yazıldı; geometri kök `viewBox`
koordinatlarında hesaplanır, AGENTS.md'deki tek dünya-koordinat kuralı korunur.

## Derleme

Bu makinede kurulu araç zinciri:

- JDK 17 — `C:\Users\Ali\tools\jdk-17.0.20+8`
- Android SDK — `C:\Users\Ali\Android\Sdk` (platform 35, build-tools 35.0.0)

```bash
cd android && JAVA_HOME="C:/Users/Ali/tools/jdk-17.0.20+8" ./gradlew :core:test
```

```bash
cd android && JAVA_HOME="C:/Users/Ali/tools/jdk-17.0.20+8" ./gradlew :app:assembleDebug
```

`local.properties` içindeki `sdk.dir` başka bir makinede kendi SDK yolunu
göstermelidir.

## Çalıştırma modları

Uygulama iki modda açılır ve mod, tek bir sabite bakılarak seçilir:

- **Çevrimdışı tanıtım (varsayılan):** hiçbir kurulum gerektirmez. Oda yerel
  bellekte kurulur, örnek harita hazırdır, üç bot komutan kendi sırasını oynar.
  Tasarımdaki sekiz ekranın tamamı bu modda gezilebilir.
- **Firestore (gerçek çok oyunculu):** web istemcisiyle aynı `eymistaken`
  projesine bağlanır, aynı odaları paylaşır.

Firestore modunu açmak için tek manuel adım:

1. Firebase konsolunda `eymistaken` projesine bir **Android uygulaması** ekle
   (paket adı `com.ageofpaper.android`).
2. Konsolun verdiği uygulama kimliğini (`1:677072278270:android:...`)
   `app/src/main/kotlin/com/ageofpaper/android/data/AppContainer.kt` içindeki
   `FirebaseConfig.ANDROID_APPLICATION_ID` sabitine yapıştır.

`google-services` Gradle eklentisi bilerek kullanılmıyor: depo, kimlik dosyası
olmadan da derlenir ve çalışır. Web uygulamasının appId'si Android istemcide
geçerli değildir, bu yüzden yeni bir kayıt gerekir.

`firestore.rules` değiştirilmedi ve deploy edilmedi. Android istemcisi mevcut
kuralların izin verdiği alan kümesinin dışına çıkmaz; her mutasyon web
istemcisindeki `roomService.js` işlemiyle aynı alanları yazar.

## Bilinen sınırlar

- **Hash paritesi.** `sourceGeometryHash` ve `metadataHash`, SVG'nin
  serileştirilmiş halinden türer. Kotlin tarafındaki serileştirici tarayıcının
  `XMLSerializer` çıktısını taklit eder, ancak birebir eşleşme her SVG için
  garanti değildir. Android'de hazırlanan harita Android'de tutarlıdır; webde
  hazırlanan bir haritayı Android **oynayabilir**, çünkü asset doğrulaması
  manifestteki hash ile yapılır ve harita webde üretilmiştir.
- **Yazı tipleri.** Tasarımın Libre Caslon Text / Source Serif 4 / Work Sans
  üçlüsü yerine sistem serif ve sans-serif aileleri aynı ağırlık ölçeğiyle
  kullanılıyor; font ikilileri depoya eklenmedi.
- **Cihazda çalıştırma.** Bu makinede kurulu emulator sistem imajı yok, bu
  yüzden APK derlendi ama ekran görüntüsüyle doğrulanmadı.
