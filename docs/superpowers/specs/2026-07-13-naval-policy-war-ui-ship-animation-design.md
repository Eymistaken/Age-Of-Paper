# Deniz Politikası, Savaş Arayüzü ve Gemi Animasyonu Tasarımı

## Kapsam ve uyumluluk

Bu adım, birinci adımın nihai terrain belgesini deniz coğrafyasının tek doğruluk kaynağı yapar. Mevcut claiming, ekonomi, tur, mobilizasyon, kara nakli/saldırısı, IndexedDB kayıtları, içerik adresli harita asset akışı ve eski inline SVG odaları korunur. Savaş mutasyonları mevcut zorunlu oda `schemaVersion: 4` sözleşmesinde kalır; yeni deniz alanları `mapDefinition` sözleşmesinin sürümlü ve geriye uyumlu uzantısıdır. Yeni haritalar açık politika alanları taşır, eski `seaNeighbors` verisi çalışma zamanında ve yeniden kayıtta veri kaybetmeden `selected_routes` olarak yorumlanır.

## Seçilen mimari

Sistem üç ayrık katmana bölünür:

1. `src/game/navalPolicy.js` politika, rota normalizasyonu, legacy migration, oyuncu deniz yeteneği, hedef uygunluğu, hata nedenleri ve kapasite hesabı için saf otoritedir.
2. Terrain editörü ve metadata katmanı `navalPolicy`, `allowedRoutes`, `blockedRoutes` alanlarını saklar. Oda belgesindeki kompakt `mapDefinition` yalnız bu seyrek politika verisini ve mevcut bölge kayıtlarını taşır; `all_coasts` için complete graph üretilmez.
3. `src/game/waterNavigation.js` ve sunum katmanı, hash’li kompakt metadata asset’inde bulunan deterministik su maskesini kullanır. Bu veri transaction kararlarına katılmaz ve oda belgesini büyütmez.

Bu ayrım, Firestore Rules ve transaction’ların yalnız oyun verisiyle karar vermesini; animasyonun başarısız olması halinde tamamlanmış oyun sonucunun geçerli kalmasını sağlar.

## Politika ve rota veri modeli

Geçerli politikalar `all_coasts`, `selected_routes` ve `disabled` değerleridir. Yeni terrain belgeleri varsayılan `all_coasts` ile oluşturulur. Rota çifti iki farklı güvenli bölge kimliğinin leksikografik sıralanmış iki elemanlı dizisidir. Normalizasyon geçersiz, öz, bilinmeyen, kıyı olmayan ve yinelenen çiftleri reddeder; sıralı ve deterministik sonuç üretir.

Bir uç yalnız şu durumda geçerlidir:

- nihai terrain türü `land`;
- türetilmiş `coastType` değeri `ocean`, `lake` veya `both`;
- kompakt uyumluluk kaydında `coastal: true`.

`portAllowed` rota ucu olmayı etkilemez; yalnız liman kurmayı etkiler. Rota eklemek terrain veya kıyı durumunu değiştirmez.

Politika semantiği:

- `all_coasts`: bütün geçerli kıyı çiftleri erişilebilirdir; yalnız `blockedRoutes` çifti reddeder. Farklı su bileşenleri uzak seferdir.
- `selected_routes`: yalnız `allowedRoutes` çifti erişilebilirdir.
- `disabled`: tüm deniz kuralları kapalıdır; listeler korunur.

Politika değişimi iki listeyi de korur. Ayrı, onaylı “Rota Ayarlarını Sıfırla” komutu iki listeyi birlikte boşaltır ve tek undo/redo komutudur.

Legacy migration, açık politika yoksa simetrik `seaNeighbors`, terrain `compatibilityRoutes` veya eski özel rota çiftlerini `allowedRoutes` içine alır ve modu `selected_routes` seçer. Hiç legacy rota yoksa yeni hazırlanmış harita `all_coasts`, gerçekten eski ve politikasız bir oda ise mevcut davranışı değiştirmemek için `selected_routes` + boş liste olarak normalize edilir. Migration saf, idempotent ve veri kaybetmeyen bir fonksiyondur.

Metadata ve editor sürümleri mevcut bir önceki sürümden açık migration gerektirecek şekilde 2’ye yükseltilir. `analysisAlgorithmVersion` terrain tespit algoritması değişmediği için korunur. Importer metadata v1’i migration fonksiyonuyla v2’ye yükseltir; bilinmeyen sürümleri reddetmeye devam eder. Manifest metadata sürümünü asset’ten alır. IndexedDB şema/store yapısı değişmez; kayıt içindeki terrain belgesi açılırken normalize edilir.

## Kompakt navigasyon asset’i

Tam yüzey sınırları ve analiz kanıtları IndexedDB’de kalır. Kompakt metadata v2, yalnız animasyon için gerekli `navigationMask` alanını taşır:

- root `viewBox`;
- deterministik sütun/satır sayısı;
- geçilebilir ocean/lake hücrelerinin bileşen bazlı satır koşuları;
- her kıyı kara bölgesi için bitişik su bileşenleri ve deterministik yaklaşım hücreleri.

Maske terrain belgesinin nihai sınıflandırmasından üretilir. Kara ve ignored hücreleri geçilemez; ocean/lake hücreleri geçilebilirdir. Aynı input her CSS boyutu, DPR, kamera ve viewport için aynı maskeyi verir. Asset boyutu mevcut 450.000 karakter sınırını aşarsa harita uygulanmaz ve açık doğrulama hatası gösterilir; detay canlı oda belgesine taşınmaz.

## Editör: Deniz Erişimi sekmesi

`TerrainInspector` üçüncü `Deniz Erişimi` sekmesini alır. Sekme nihai terrain belgesinden kıyı uçlarını çıkarır, politika seçicisini, kaynak kıyı özetini, hedef listesini ve sıfırlama işlemini sunar. `portAllowed: false` uçlar “Liman kurulamaz” etiketiyle görünür.

Kaynak seçiliyken harita yalnız kaynağa ait bağlantıları çizer. `all_coasts` için açık hedefler yeşil, `blockedRoutes` hedefleri kırmızı; `selected_routes` için `allowedRoutes` hedefleri yeşil, diğer geçerli kıyılar kırmızıdır. İç kara ve su yüzeyleri rota hedefi olmaz. `disabled` modunda düzenleme araçları kaldırılır ve açıklama gösterilir.

Host değişiklikleri `commitDocument` üzerinden tek komut olarak history’ye girer; derivation, autosave, export ve “Odaya Uygula” aynı güvenli akışı kullanır. Non-host oda haritasını aynı tam ekran editörde `readOnly` açar: politika, rota durumları, terrain ve liman bilgileri görünür; sınıflandırma, politika, rota, isim, reset, autosave mutation ve odaya uygulama kontrolleri kapalıdır.

## Deniz yeteneği ve savaş arayüzü

Saf `getPlayerNavalCapability` sonucu şu alanları verir: politika etkinliği, sahip olunan uygun kıyılar, liman kurulabilir kıyılar, mevcut limanlar, erişilebilir hedefler, gemi kapasitesi ve görünür kontrol seviyesi.

Deniz bölümü yalnız politika etkin, oyuncunun `portAllowed` bir kıyı karası var ve bu kıyılardan en az birinin politika bazlı hedefi varsa görünür. Hiç limanı olmayan oyuncuya yalnız uygun seçili kıyıda “Liman Kur” sunulur. En az bir liman oluşunca gemi ve deniz harekâtı kontrolleri açılır. Son uygun kıyı kaybedildiğinde hesap oda snapshot’ından yeniden yapıldığı için bölüm anında kaybolur. `disabled` mevcut `hasPort` ve `ships` verisini silmez.

Harita hedef durumu her render’da güncel room state, operasyon türü, asker miktarı ve gemi kapasitesiyle saf fonksiyondan hesaplanır. Yasal kıyılar yeşil; kıyı olup geçersiz hedefler kırmızıdır. Geçersiz hedef seçimi planı ilerletmez ve şu kesin nedenlerden birini gösterir: rota engelli, özel rota yok, liman gerekli, yetersiz kapasite, yetersiz asker, nakil için düşman, saldırı için dost, politika kapalı veya stale kıyı.

## Authoritative transaction ve Rules

`roomService` her lojistik ve deniz operasyonunda beklenen turu, schema v4’ü ve saf sonucu transaction snapshot’ı üzerinde yeniden doğrular. Liman kurma; nihai kıyı kara, `portAllowed`, etkin politika, sahiplik, aktif oyuncu, faz/tur, maliyet ve değişen alanları denetler. Gemi satın alma ve deniz operasyonları da etkin politika, kaynak liman, rota izni, asker ve kalıcı gemi kapasitesini yeniden denetler.

Rules yeni mapDefinition politika alanlarının enum/list biçimini, liste benzersizliğini ve host+lobby değişiklik sınırını korur. Politika/rota ayarı yalnız `naval_config` action’ıyla ve action’daki normalize uçlar üzerinden değişebilir; tek mutation yalnız beklenen liste alanını değiştirebilir. Oyun başladıktan sonra mapDefinition değişmez. Liman ve deniz operasyonu Rules fonksiyonları politika bazlı izin, kıyı/portAllowed, kaynak liman, sahiplik, kapasite, maliyet, stale turn ve izin verilen oda alanlarını yeniden doğrular. Legacy mapDefinition için `seaNeighbors` selected-route fallback’i yalnız mevcut kayıtların çalışmasına izin verir; yeni ayar yazıları açık politika alanı gerektirir.

## Su yolu ve uzak sefer

`waterNavigation` normalize maskeden A* ile deterministik hücre yolu üretir. Komşu sırası ve eşit maliyet tie-break’i hücre indeksine göre sabittir. Başlangıç ve hedef kıyıları kendi yaklaşım hücrelerine bağlanır. Aynı su bileşeninde tek su yolu hesaplanır.

Farklı bileşenlerde politika erişimi varsa iki su yolu hesaplanır: kaynak yaklaşımından kaynak bileşeninin deterministik sefer noktasına ve hedef bileşeninin sefer noktasından hedef yaklaşımına. Aradaki bölüm `remote_transition` olarak işaretlenir; gemi fade-out/fade-in yapar ve hiçbir ara karede karada çizilmez.

Yol sadeleştirme yalnız grid line-of-sight denetimi bütün kesilen hücrelerin aynı geçilebilir bileşende olduğunu kanıtlarsa nokta atar. Yol bulunamazsa düz çizgi üretilmez; sonuç `highlight_only` olur.

## Animasyon ve kamera

Naval transfer/saldırı transaction’ı state’i hemen tamamlar. `lastAction` mevcut kompakt `type`, `actionId`, `sourceId`, `targetId`, `amount`, sonuç ve turn alanlarını taşır; geometri taşımaz.

MapViewer içinde ayrı bir saf sunum reducer’ı işlenmiş `actionId` değerini tutar. Yeni naval action hem yerel hem uzak oyuncuda bir kez sunulur; aynı snapshot/rerender tekrar oynatmaz. Yeni action, room/map değişimi ve unmount bütün rAF/timer/focus işlerini temizler.

Gemi world-coordinate overlay içinde path boyunca hareket eder ve pointer events almaz. Reduced-motion durumunda yalnız kısa kaynak/hedef vurgusu gösterilir. Yol yoksa aynı highlight-only davranışı kullanılır. Normal animasyon tamamlandığında hedef, mevcut bounded-measurement kamera pipeline’ıyla gösterilir ve immutable base camera snapshot’ına geri döner. Kullanıcının pan, pinch, wheel, zoom kontrolü veya fit komutu pending focus’u iptal eder; sonraki otomasyon kullanıcı kamerasını geri almaz.

## Test ve smoke stratejisi

Saf testler politika modları, çift normalizasyonu, migration, kıyı/liman invariants, capability, bütün hedef hata kodları, kapasite ve A*/sadeleştirme/uzak seferi kapsar. Metadata testleri v1→v2 migration ve v2 round-trip’i doğrular. Component testleri editör salt okunur modu, policy tabı, yeşil/kırmızı hedefler, dinamik menü, tek sefer animasyon, reduced motion ve manuel kamera iptalini kapsar. Service ve emulator testleri host/non-host/outsider, lobby sonrası değişiklik, stale turn, sahte liman, rota ve kapasite mutasyonlarını reddeder.

Gerçek tarayıcı smoke testi yalnız sentetik/local veriyi kullanır. Desktop ve mobile viewport’larda istenen 13 senaryo; ayrıca maskenin hiçbir animasyon örneğini kara hücresine yerleştirmediği bir debug assertion ile doğrulanır. Son kapıda sırasıyla lint, unit, Rules ve build çalıştırılır; başarısızlıkta commit yapılmaz.
