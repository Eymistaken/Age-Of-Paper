# Age of Paper

Age of Paper, oyuncuların yüklenen bir SVG harita üzerinde toprak edindiği, seferberlik yaptığı ve deterministik bir savaş yürüttüğü Firebase destekli çevrim içi strateji oyunudur. Arayüz, projenin karanlık parşömen ve bronz “Commander’s Desk” görsel kimliğini masaüstü, tablet ve telefonda korur.

## Çalıştırma

Node.js 20 önerilir.

```bash
npm install
npm run dev
npm run lint
npm test
npm run test:rules
npm run build
```

`npm run dev` yerel Vite geliştirme sunucusunu, `npm run build` ise `dist/` üretim çıktısını oluşturur. Bu komutların hiçbiri Firebase veya hosting deployment çalıştırmaz.

## Oyun evreleri

Merkezi evre tanımı `src/game/phases.js` içindedir:

- `lobby`: oyuncular katılır, host SVG haritayı yükler ve doğrulama sonucunu görür.
- `claiming`: oyuncular sırayla yasal, tarafsız bölgeleri satın alır.
- `claim_complete`: bütün oynanabilir bölgeler alındığında atomik olarak geçilir; satın alma ve tur eylemleri donar.
- `mobilization`: kurucu özeti onayladıktan sonra her etkin komutan tam bir hazırlık turu oynar.
- `war`: lojistik satın alımlarından sonra en fazla bir nakil, saldırı veya boş tur emri verilir.
- `finished`: tek bölge sahibi komutan kaldığında ekonomi ve harekât donar; sonuçlar ile sohbet açık kalır.

Son claim `claim_complete` ekranında donar ve son claim sahibine ikinci bir tur vermez. Yalnızca güncel kurucu “Seferberliği Başlat” emrini verebilir. Seferberlik, final claim sahibinden hemen sonraki etkin oyuncuyla başlar.

## Oda veri modeli

Yeni oda belgeleri `schemaVersion: 4` kullanır. Önemli alanlar:

- `phase`, `hostId`, `players`
- `mapSvg`, `mapDefinition`, `mapValidation`
- `claims`
- `turnOrder`, `turnIndex`, `turnNumber`, `roundNumber`
- `chat`, `lastAction`
- `joinRequests`, `joinRequestAction`
- `mobilizationTurnsRemaining`, `mobilizationPending`
- `winnerId`, `completedAt`

Oyuncu kaydı `eliminated` durumunu taşır. Claim kaydı seferberlikten itibaren `soldiers`, `hasPort` ve `ships` alanlarını taşır. Oyuncunun `income` alanı `BASE_INCOME + sahip olduğu bölgelerin tanımlı gelirleri` toplamıdır. `lastIncomeTurn`, aynı `turnNumber` için iki kez gelir verilmesini engeller. Claim, lojistik, nakil, saldırı, teslim, eleme ve zafer işlemleri `src/services/roomService.js` içindeki Firestore transaction fonksiyonlarında merkezi olarak yürütülür.

Eski odalar güvenli okuma varsayımlarıyla açılabilir. Ancak schema 4 olmayan bir `mobilization` veya `war` kaydı oynanabilir sayılmaz; savaş mutation'ları `INCOMPATIBLE_ROOM` ile reddedilir.

## mapDefinition formatı

Harita mantığı render edilen SVG’den bağımsızdır. İçe aktarılan tanım sürümlenir ve oda belgesine bir kez kaydedilir:

```json
{
  "version": 1,
  "pricingVersion": 2,
  "regionIds": ["a", "coast_2"],
  "regions": [
    {
      "id": "a",
      "name": "A",
      "price": 6200,
      "income": 700,
      "landNeighbors": ["coast_2"],
      "claimNeighbors": ["coast_2"],
      "coastal": true,
      "seaNeighbors": ["coast_2"]
    }
  ],
  "regionsById": {
    "a": "aynı bölge kaydının field-path güvenli anahtarlı kopyası"
  }
}
```

`pricingVersion: 2`, metadata bulunmayan bölgelerde transform uygulanmış görsel bounds alanlarını bölge medyanına göre normalize eder. Otomatik fiyat `sqrt(regionArea / medianArea)` büyüklük katsayısıyla 5.000–40.000 arasında clamp edilir ve 500’e yuvarlanır. Otomatik gelir fiyatın yaklaşık %10’udur; 500–4.000 arasında clamp edilip 100’e yuvarlanır. `data-price` ve `data-income` her zaman otomatik değerlerden önceliklidir.

Metadata tabanlı SVG’lerde oynanabilir şekilleri `data-region="true"` ile işaretlemek önerilir. Desteklenen nitelikler:

- `id`, `data-name`
- `data-price`, `data-income`
- `data-land-neighbors`, `data-claim-neighbors` veya ikisi için `data-neighbors`
- `data-coastal="true"`
- `data-sea-neighbors="coast_2 island_1"`
- dekorasyon için `data-ignore="true"`

Bölge ID’leri Firestore field path ile uyumlu biçime normalize edilir. Nokta, boşluk ve güvensiz karakterler `_` olur; normalizasyon çakışmaları hata sayılır.

### Legacy SVG davranışı

Açık `data-region="true"` yoksa importer, uygun `path`, `polygon`, `rect`, `circle`, `ellipse` ve `polyline` öğelerini aday kabul eder. `<defs>`, `clipPath`, `mask`, `pattern`, `marker`, `symbol`, `fill="none"`, su/dekorasyon sınıfları ve `data-ignore="true"` öğeleri dışlanır.

Komşuluk metadata’sı eksikse yalnızca import sırasında iki aşamalı SVG `viewBox` geometrisi kullanılır. Bounding box yalnızca ucuz aday elemesidir; kesin karar, ortak koordinatlara CTM ile taşınmış ve eğrilerden örneklenmiş sınır segmentlerinin ölçek bağımsız mesafesi ile anlamlı ortak uzunluğuna göre verilir. Tek köşe teması, iç içe bounding box veya arada toleranstan büyük boşluk komşuluk oluşturmaz. Ölçüm alınamazsa importer yanlış pozitif üretmek yerine otomatik bağlantı kurmaz ve lobide metadata uyarısı gösterir. Fiyat için ölçülemeyen bölge güvenli medyan büyüklüğe düşer; ham path parametreleri x/y çiftleri olarak yorumlanmaz. Sonuç zoom, viewport ve cihaz genişliğinden etkilenmez. Yeni haritalarda açık metadata kullanılmalıdır.

Importer, ekrana vermeden önce `script`, `foreignObject`, `iframe`, `object`, `embed`, inline event handler ve güvenli olmayan harici URL/href içeriklerini temizler.

## Harita doğrulama

`src/game/mapValidation.js` aşağıdaki durumlarda oyunun başlamasını engeller:

- oynanabilir bölge bulunmaması
- duplicate veya field-path için güvensiz ID
- bilinmeyen veya kendisine yönelen komşuluk
- her ilk claim’den tamamlanamayan claim grafiği
- geçersiz ya da negatif fiyat/gelir

Tek yönlü claim bağlantıları ve legacy geometri çıkarımı anlaşılır uyarı üretir. Deniz rotalarında bilinmeyen kimlik, kendi kendine rota, tekrar, tek yönlülük ve kıyı olmayan uç hata sayılır. Kıyı bölgeleri olup rota bulunmaması yalnızca uyarıdır; kara oyunu başlatılabilir.

Kurucu geçerli harita yüklendikten sonra lobideki görsel deniz editörünü kullanabilir. Bir bölgeyi kıyı olarak işaretleyebilir, iki dinamik bölge arasında çift yönlü rota kurabilir, rotayı kaldırabilir ve rota kullanan bir kıyı işaretini rotaları aynı atomik işlemde kaldırarak kapatabilir. Düzenleme sırasında rotalar bölge merkezleri arasında kesik mavi-yeşil çizgilerle gösterilir. Bu değişiklikler yalnızca lobide ve kurucu transaction'ıyla yapılır.

## Seferberlik, ekonomi ve lojistik

Seferberlik başlarken her alınmış bölge `soldiers: 1000`, `hasPort: false`, `ships: 0` alır. Her etkin oyuncu tam bir seferberlik turu tamamlar. Bu evrede nakil ve saldırı yoktur; lojistikten sonra “Hazırım” turu bitirir.

Seferberlik ve savaş turunun başında güncel gelir otomatik ve tam bir kez verilir. Gelir yalnızca React effect'ine bağlı değildir: bütün yasal lojistik ve harekât transaction'ları önce `lastIncomeTurn` kontrolünü uygular. Tekrarlanan snapshot, yenileme veya yarış aynı tur gelirini çoğaltmaz. Çevrimdışı atlanan oyuncu gelir almaz.

Başlangıç dengesi:

- 1.000 askerlik batch: 10.000 altın
- liman: 30.000 altın
- gemi: 20.000 altın
- gemi kapasitesi: 1.000 asker

Asker doğrudan seçilen sahipli bölgeye eklenir. Liman yalnızca sahipli kıyı bölgesine kurulur. Gemi yalnızca sahipli, limanlı kıyı bölgesinde satın alınır. Lojistik satın alımları turu bitirmez ve aynı tur içinde para yettiği sürece tekrarlanabilir.

## Nakil ve deterministik savaş

Savaşta tam bir harekât turu bitirir: kara nakli, deniz nakli, kara saldırısı, deniz saldırısı veya harekâtsız tur sonu.

Kara nakli, yalnızca oyuncunun bölgelerinden ve `landNeighbors` bağlantılarından oluşan çok bölgeli bir dost yol kullanabilir. Deniz nakli doğrudan çift yönlü `seaNeighbors` rotası, kaynak limanı ve yeterli kalıcı gemi kapasitesi gerektirir. Gemiler tüketilmez veya taşınmaz.

Saldırıda oyuncu kaynağı, hedefi ve pozitif 1.000 katı asker sayısını seçer. Rastgelelik yoktur:

```text
attacking > defending  => hedef alınır, attacking - defending asker kalır
attacking <= defending => sahip değişmez, defending - attacking asker kalır
```

Beraberlikte savunan sahip sıfır askerle bölgeyi tutar. Ele geçirilen liman korunur, hedefteki gemiler yok edilir. Sahiplik, iki tarafın `regionIds` listesi, gelir, eleme, sıra ve olası zafer aynı transaction içinde güncellenir.

Son bölgesini kaybeden oyuncu elenir, sıra listesinden çıkar ancak seyirci ve sohbet üyesi kalır. `claim_complete`, `mobilization` veya `war` sırasında ayrılmak teslim sayılır: üyelik silinir, bölgeler sıfır asker/gemiyle tarafsızlaşır, limanlar korunur ve kuruculuk deterministik biçimde devredilir. Tek etkin bölge sahibi kaldığında tarafsız bölgeler bulunsa bile oyun `finished` olur.

## Tur, presence ve chat

Claiming evresinde bölge satın alma veya “Para Biriktir” tek tur seçimidir. `turnNumber` oyun boyunca monoton artar, `roundNumber` bütün etkin oyuncuların döngüsünü, `turnIndex` ise etkin sıra konumunu tutar.

Presence heartbeat 20 saniyedir. Presence yalnız bir gösterge olup tur zaman aşımı değildir. Host, aktif oyuncu en az 120 saniye çevrimdışı kaldıktan sonra transaction tabanlı sıra atlama eylemini kullanabilir.

Chat mesajlarında benzersiz ID, gönderen UID ve zaman vardır. Mesajlar 160 karakterle, oda geçmişi son 80 mesajla sınırlıdır.

## Oyun sırasında katılma

Lobby evresinde doğrudan katılım sürer ve oda kapasitesi 10 oyuncudur. `claiming` sırasında oda koduyla gelen kullanıcı doğrudan oyuncu yapılmaz; oda belgesindeki en fazla 20 kayıtla sınırlı `joinRequests` haritasına 10 dakikalık bir istek eklenir. İstek sahibi bekleme durumunu localStorage ile sayfa yenilemesinde sürdürebilir ve transaction ile vazgeçebilir.

Güncel host isteği tek başına kabul veya tamamen ret edebilir. Host cevap vermezse, istek oluşturulduğunda snapshot alınan host dışı seçmenlerin hâlâ odada bulunanlarının tamamı kabul ettiğinde istek kabul edilir; boş seçmen kümesi otomatik kabul değildir. Kabul transaction’ı kapasiteyi, evreyi ve tarafsız bölgeyi yeniden doğrular; yeni oyuncuyu sıfır para ve bölgeyle sıra sonuna ekler, mevcut tur/round alanlarını değiştirmez. Terminal istekler host tarafından temizlenir ve oda belgesinin büyümesi sınırlandırılır.

SVG yükleme alanı aynı sanitization, pricing ve validation hattını kullanan dosya seçici ile sürükle–bırak davranışını birlikte sunar. Tek `.svg` dosyası kabul edilir ve dosya boyutu 600 KB ile sınırlıdır.

## Güvenlik sınırları

`firestore.rules`, schema 4 oda oluşturmayı, üyelik/presence/chat ayrımını, host-only lobi rota düzenlemeyi, evreyi, etkin ve elenmemiş aktörü, tur numarasını, gelir damgasını, lojistik maliyetlerini, asker adımlarını, doğrudan saldırı komşuluğunu, deniz rotası/liman/gemi kapasitesini, deterministik kayıpları ve bitmiş oyun donmasını doğrular. Mevcut join request, claim ve save-income korumaları korunur.

Yine de oyun tamamen istemci tabanlıdır. Firestore Rules döngü veya keyfi graph traversal yapamadığı için çok adımlı dost kara yolunun her ara kenarını ve host'un bütün dinamik harita tanımını sunucu gibi yeniden hesaplayamaz. Transaction katmanı saf kuralları uygular, rules yerel olarak ispatlanabilen mutation aritmetiğini sınırlar; güçlü rekabetçi hile koruması için bu graph ve harita doğrulaması Cloud Function veya başka güvenilir sunucu koduna taşınmalıdır. App Check ve kalıcı kimlik doğrulama ayrıca değerlendirilmelidir. Firebase web yapılandırma anahtarı sunucu parolası değildir.

Bu depodaki `firestore.rules` yalnızca kaynak dosyadır. Bu özellik kuralları veya hosting'i deploy etmez.

Kuralları yerel Firestore emulator ile sınamak için:

```bash
npm run test:rules
```

Kaynak kuralları daha sonra açıkça deploy etmek için:

```bash
npx firebase-tools deploy --only firestore:rules --project eymistaken
```
