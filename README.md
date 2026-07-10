# Age of Paper

Age of Paper, oyuncuların bir SVG harita üzerinde sırayla bağlı bölgeler satın aldığı, Firebase destekli çevrim içi bir toprak edinme oyunudur. Arayüz, projenin karanlık parşömen ve bronz “Commander’s Desk” görsel kimliğini masaüstü, tablet ve telefonda korur.

Bu sürüm bilinçli olarak yalnızca güvenilir toprak edinme temelini içerir. Asker, rezerv, liman, gemi ve saldırı sistemleri kaldırılmıştır; yeni bir savaş sistemi henüz oynanabilir değildir.

## Çalıştırma

Node.js 20 önerilir.

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```

`npm run dev` yerel Vite geliştirme sunucusunu, `npm run build` ise `dist/` üretim çıktısını oluşturur. Bu komutların hiçbiri Firebase veya hosting deployment çalıştırmaz.

## Oyun evreleri

Merkezi evre tanımı `src/game/phases.js` içindedir:

- `lobby`: oyuncular katılır, host SVG haritayı yükler ve doğrulama sonucunu görür.
- `claiming`: oyuncular sırayla yasal, tarafsız bölgeleri satın alır.
- `claim_complete`: bütün oynanabilir bölgeler alındığında atomik olarak geçilir; satın alma ve tur eylemleri donar.

Mimari ileride `mobilization`, `war` ve `finished` evrelerini eklemeye uygun isimlendirilmiştir; bu evreler bu sürümde etkin değildir. Eski geçici odalardaki `status` alanı yalnızca ekranın çökmemesi için okunabilir; eski combat alanları yok sayılır ve yeni odalara yazılmaz.

## Oda veri modeli

Yeni oda belgeleri `schemaVersion: 2` kullanır. Önemli alanlar:

- `phase`, `hostId`, `players`
- `mapSvg`, `mapDefinition`, `mapValidation`
- `claims`
- `turnOrder`, `turnIndex`, `turnNumber`, `roundNumber`
- `chat`, `lastAction`

Oyuncunun `income` alanı `BASE_INCOME + sahip olduğu bölgelerin tanımlı gelirleri` toplamıdır. `lastIncomeTurn`, aynı `turnNumber` için iki kez gelir verilmesini engeller. Claim ve tur eylemleri `src/services/roomService.js` içindeki Firestore transaction fonksiyonlarında merkezi olarak yürütülür.

## mapDefinition formatı

Harita mantığı render edilen SVG’den bağımsızdır. İçe aktarılan tanım sürümlenir ve oda belgesine bir kez kaydedilir:

```json
{
  "version": 1,
  "pricingVersion": 2,
  "regionIds": ["ankara", "konya"],
  "regions": [
    {
      "id": "ankara",
      "name": "Ankara",
      "price": 6200,
      "income": 700,
      "landNeighbors": ["konya"],
      "claimNeighbors": ["konya"],
      "coastal": false
    }
  ],
  "regionsById": {
    "ankara": "aynı bölge kaydının field-path güvenli anahtarlı kopyası"
  }
}
```

`pricingVersion: 2`, metadata bulunmayan bölgelerde transform uygulanmış görsel bounds alanlarını bölge medyanına göre normalize eder. Otomatik fiyat `sqrt(regionArea / medianArea)` büyüklük katsayısıyla 5.000–40.000 arasında clamp edilir ve 500’e yuvarlanır. Otomatik gelir fiyatın yaklaşık %10’udur; 500–4.000 arasında clamp edilip 100’e yuvarlanır. `data-price` ve `data-income` her zaman otomatik değerlerden önceliklidir.

Metadata tabanlı SVG’lerde oynanabilir şekilleri `data-region="true"` ile işaretlemek önerilir. Desteklenen nitelikler:

- `id`, `data-name`
- `data-price`, `data-income`
- `data-land-neighbors`, `data-claim-neighbors` veya ikisi için `data-neighbors`
- `data-coastal="true"`
- dekorasyon için `data-ignore="true"`

Bölge ID’leri Firestore field path ile uyumlu biçime normalize edilir. Nokta, boşluk ve güvensiz karakterler `_` olur; normalizasyon çakışmaları hata sayılır.

### Legacy SVG davranışı

Açık `data-region="true"` yoksa importer, uygun `path`, `polygon`, `rect`, `circle`, `ellipse` ve `polyline` öğelerini aday kabul eder. `<defs>`, `clipPath`, `mask`, `pattern`, `marker`, `symbol`, `fill="none"`, su/dekorasyon sınıfları ve `data-ignore="true"` öğeleri dışlanır.

Komşuluk metadata’sı eksikse yalnızca import sırasında SVG `viewBox` koordinatlarında deterministik bounding-box yakınlığı kullanılır. Tarayıcı ölçüm yüzeyi `getBBox()` ve CTM ile path komutlarını ve transform zincirini SVG motoruna ölçtürür. Ölçüm alınamazsa bölge fiyatı güvenli medyan büyüklüğe düşer ve lobide uyarı gösterilir; ham path parametreleri x/y çiftleri olarak yorumlanmaz. Sonuç zoom, viewport ve cihaz genişliğinden etkilenmez. Yeni haritalarda açık metadata kullanılmalıdır.

Importer, ekrana vermeden önce `script`, `foreignObject`, `iframe`, `object`, `embed`, inline event handler ve güvenli olmayan harici URL/href içeriklerini temizler.

## Harita doğrulama

`src/game/mapValidation.js` aşağıdaki durumlarda oyunun başlamasını engeller:

- oynanabilir bölge bulunmaması
- duplicate veya field-path için güvensiz ID
- bilinmeyen veya kendisine yönelen komşuluk
- her ilk claim’den tamamlanamayan claim grafiği
- geçersiz ya da negatif fiyat/gelir

Tek yönlü claim bağlantıları ve legacy geometri çıkarımı anlaşılır uyarı üretir. Lobi bölge sayısını, hataları ve uyarıları oyun başlamadan gösterir.

## Tur, presence ve chat

Gelir aktif oyuncunun tur başında transaction ile ve bir kez verilir. Bölge satın alma veya “Turu Bitir” gelir üretmez; ikisi de sırayı ilerletir. `turnNumber` oyun boyunca monoton artar, `roundNumber` bütün aktif oyuncuların döngüsünü, `turnIndex` ise aktif sıra konumunu tutar.

Presence heartbeat 20 saniyedir. Presence yalnız bir gösterge olup tur zaman aşımı değildir. Host, aktif oyuncu en az 120 saniye çevrimdışı kaldıktan sonra transaction tabanlı sıra atlama eylemini kullanabilir.

Chat mesajlarında benzersiz ID, gönderen UID ve zaman vardır. Mesajlar 160 karakterle, oda geçmişi son 80 mesajla sınırlıdır.

## Güvenlik sınırları

`firestore.rules`, oda oluşturma şemasını, lobby join kapasitesini, oyuncuya özel presence alanını, host harita/başlatma eylemlerini ve claim/tur/chat alan ayrımını doğrular. Claim fiyatı ve geliri kurallarda tekrar sabitlenmez; odanın doğrulanmış `mapDefinition` kaydı kullanılır.

Yine de oyun tamamen istemci tabanlıdır. Harita importu ve transaction kararları yetkili bir backend veya Cloud Function üzerinde çalışmadığı için rules güçlü bir tutarlılık katmanı olsa da tam hile koruması değildir. Rekabetçi bir savaş sistemi eklenmeden önce kritik eylemler güvenilir sunucu koduna taşınmalı, App Check ve uygun kimlik doğrulama değerlendirilmelidir. Firebase web yapılandırma anahtarı bir sunucu parolası değildir; gerçek erişim güvenliği Authentication ve Firestore Rules ile sağlanır.

Bu depodaki `firestore.rules` yalnızca kaynak dosyadır. Değişiklikleri deployment etme işlemi bu refaktörün parçası değildir.
