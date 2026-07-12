# Deniz Politikası, Savaş Arayüzü ve Gemi Animasyonu Uygulama Planı

> **For agentic workers:** Bu plan mevcut oturumda inline uygulanır. Kullanıcının talimatı gereği ara commit oluşturulmaz; yalnız bütün doğrulamalar geçtikten sonra tek nihai commit yapılır.

**Goal:** Terrain tabanlı üç deniz politikası, oyuncuya göre açılan savaş deniz arayüzü ve karadan geçmeyen deterministik gemi sunumu eklemek.

**Architecture:** Saf `navalPolicy` modülü bütün authoritative deniz kararlarını, saf `waterNavigation` modülü yalnız görsel su rotasını hesaplar. Terrain/metadata/mapDefinition seyrek politika verisini taşır; sıkıştırılmış navigasyon maskesi yalnız içerik adresli metadata asset’i ve IndexedDB cache’i üzerinden istemciye gelir. Transaction ve Rules aynı politika/liman/kapasite invariants’ını bağımsız doğrular.

**Tech Stack:** React 18, Vite, Vitest/JSDOM, Firebase Firestore transactions/rules emulator, SVG root-viewBox geometri, IndexedDB.

---

### Task 1: Saf deniz politikası sözleşmesi

**Files:**
- Create: `src/game/navalPolicy.js`
- Create: `src/game/navalPolicy.test.js`
- Modify: `src/game/navalRoutes.js`
- Modify: `src/game/navalRoutes.test.js`

- [ ] `NAVAL_POLICIES`, `normalizeRoutePair`, `navalRouteKey`, `normalizeRouteList`, `isFinalCoastalLand`, `migrateLegacyNavalPolicy`, `normalizeNavalConfig`, `isNavalRouteAllowed`, `getPlayerNavalCapability`, `getNavalTargetEligibility` ve `requiredNavalCapacity` saf API’lerini testlerle tanımla.
- [ ] `all_coasts` blocked istisnası, `selected_routes` allowed listesi, `disabled`, liste koruma/reset, simetri, duplicate, inland, ocean/lake/both ve legacy `seaNeighbors` senaryolarını önce failing test olarak çalıştır.
- [ ] Eski `navalRoutes` API’sini compatibility wrapper olarak koru; rota eklerken kıyı işaretleme davranışını yeni politika API’sinde yasakla ve mevcut çağrıları migration yoluna hazırla.
- [ ] Run: `npx vitest run src/game/navalPolicy.test.js src/game/navalRoutes.test.js` — expected: all pass.

Temel sözleşme:

```js
export const NAVAL_POLICIES = Object.freeze({
  ALL_COASTS: 'all_coasts',
  SELECTED_ROUTES: 'selected_routes',
  DISABLED: 'disabled',
});

export function normalizeRoutePair(firstId, secondId) {
  if (!firstId || !secondId || firstId === secondId) return null;
  return [String(firstId), String(secondId)].sort((a, b) => a.localeCompare(b));
}
```

### Task 2: Terrain, metadata ve legacy migration

**Files:**
- Modify: `src/game/terrainModel.js`
- Modify: `src/game/terrainModel.test.js`
- Modify: `src/game/mapMetadata.js`
- Modify: `src/game/mapMetadata.test.js`
- Modify: `src/game/mapImporter.js`
- Modify: `src/game/mapImporter.test.js`
- Modify: `src/game/mapValidation.js`
- Modify: `src/game/mapValidation.test.js`
- Modify: `docs/metadata.md`

- [ ] Editor/metadata schema v2 sabitlerini ekle ve metadata v1→v2 migration testini yaz.
- [ ] `deriveTerrainDocument` içinde politika/listeleri normalize et; yalnız nihai kıyı uçları koru ve invalid çiftleri doğrulama sonucu olarak raporla.
- [ ] `buildCompatibilityMapDefinition` içine `navalPolicy`, `allowedRoutes`, `blockedRoutes` ekle; `seaNeighbors` alanını legacy okuma için üretmeye devam et fakat `all_coasts` graph’ını materyalize etme.
- [ ] Metadata top-level allowlist, create/validate/extract/import/round-trip akışlarını v2 alanlarıyla genişlet.
- [ ] Eski embedded metadata, ordinary SVG `data-sea-neighbors`, local record ve legacy room mapDefinition migration testlerini geçir.
- [ ] Run: `npx vitest run src/game/terrainModel.test.js src/game/mapMetadata.test.js src/game/mapImporter.test.js src/game/mapValidation.test.js` — expected: all pass.

### Task 3: Deterministik su navigasyon maskesi ve A*

**Files:**
- Create: `src/game/waterNavigation.js`
- Create: `src/game/waterNavigation.test.js`
- Modify: `src/game/terrainAnalysis.js`
- Modify: `src/game/mapMetadata.js`
- Modify: `src/game/mapImporter.js`

- [ ] Terrain belgesinin final land/ocean/lake/ignored sonucundan sabit viewBox grid maskesi üreten testleri yaz.
- [ ] Bileşen koşuları ve kıyı yaklaşım hücrelerini compact metadata `navigationMask` alanına ekle; full local document ayrıntılarını koru.
- [ ] Deterministik 8-komşulu A*, sabit tie-break, aynı bileşen rotası, farklı bileşen `remote_transition`, Bresenham tabanlı güvenli sadeleştirme ve `highlight_only` sonucunu uygula.
- [ ] Yol noktalarının tamamının passable hücrede olduğunu; kara bariyerini kesmediğini; yol yoksa düz çizgi üretilmediğini test et.
- [ ] Büyük Göller–okyanus farklı bileşen fixture’ında iki su segmenti ve remote transition doğrula.
- [ ] Run: `npx vitest run src/game/waterNavigation.test.js src/game/terrainAnalysis.test.js src/game/mapMetadata.test.js` — expected: all pass.

Beklenen çıktı şekli:

```js
{
  kind: 'remote_voyage',
  segments: [
    { kind: 'water', componentId: 'lake_1', points: [...] },
    { kind: 'remote_transition' },
    { kind: 'water', componentId: 'water_1', points: [...] },
  ],
}
```

### Task 4: Editör Deniz Erişimi sekmesi ve salt okunur görünüm

**Files:**
- Modify: `src/components/TerrainMapEditor.jsx`
- Modify: `src/components/TerrainMapEditor.test.jsx`
- Modify: `src/components/TerrainInspector.jsx`
- Modify: `src/components/TerrainInspector.test.jsx`
- Modify: `src/components/TerrainMapCanvas.jsx`
- Modify: `src/index.css`
- Modify: `src/App.jsx`
- Modify: `src/components/WaitingRoom.jsx`
- Delete after callers migrate: `src/components/NavalRouteEditor.jsx`
- Delete after callers migrate: `src/components/NavalRouteEditor.test.jsx`

- [ ] Üçüncü tab, politika seçici, kaynak kıyı, yeşil/kırmızı hedef listesi, `portAllowed` etiketi ve disabled açıklaması component testlerini yaz.
- [ ] Rota toggle, policy change ve onaylı reset’i `commitDocument` history/autosave pipeline’ına bağla; policy change listeleri korusun.
- [ ] Canvas’ta yalnız seçili kaynağın bağlantı çizgilerini ve target sınıflarını world coordinates ile çiz; bütün graph’ı çizme.
- [ ] `readOnly` prop ile non-host mutation/autosave/apply kontrollerini kapat; oda asset’inden açılan terrain belgesini görüntüle.
- [ ] WaitingRoom’daki legacy dialog akışını tam TerrainMapEditor read-only akışına taşı; host da rota ayarını yalnız hazırlık masasında değiştirip “Odaya Uygula” kullansın.
- [ ] Desktop/mobile tab ve portal düzenini mevcut Commander’s Desk tokenlarıyla responsive biçimde stillendir.
- [ ] Run: `npx vitest run src/components/TerrainMapEditor.test.jsx src/components/TerrainInspector.test.jsx src/components/appFlow.smoke.test.jsx` — expected: all pass.

### Task 5: Authoritative savaş mantığı ve dinamik deniz menüsü

**Files:**
- Modify: `src/game/warEconomy.js`
- Modify: `src/game/warMovement.js`
- Modify: `src/game/warCombat.js`
- Modify: `src/game/warUiState.js`
- Modify: `src/game/warSystem.test.js`
- Modify: `src/game/warUiState.test.js`
- Modify: `src/components/WarCommandPanel.jsx`
- Modify: `src/components/WarCommandPanel.test.jsx`
- Modify: `src/components/GameRoom.jsx`
- Modify: `src/components/MobileGameRoom.jsx`
- Modify: `src/components/MapViewer.jsx`

- [ ] Port kurma ve gemi satın alma için final coastType/portAllowed/policy kontrollerini failing saf testlerle ekle.
- [ ] Naval transfer/attack route kontrolünü `isNavalRouteAllowed` ile değiştir; legacy fallback’i test et.
- [ ] `getWarHighlights` sonucuna `invalidTargets` ve id→reason haritası ekle; miktar/kapasite/state değişiminde yeniden hesapla.
- [ ] Invalid kıyıya tıklamada dokuz kesin Türkçe nedeni göster; plan stale olduğunda seçimi iptal et.
- [ ] Capability’ye göre deniz bölümünü tamamen gizle; limansız uygun oyuncuya yalnız “Liman Kur”, limanlı oyuncuya gemi/nakil/saldırı göster.
- [ ] Desktop ve mobile ortak `WarCommandPanel` akışını test et.
- [ ] Run: `npx vitest run src/game/warSystem.test.js src/game/warUiState.test.js src/components/WarCommandPanel.test.jsx` — expected: all pass.

### Task 6: Transaction, lastAction ve Firestore Rules

**Files:**
- Modify: `src/services/roomService.js`
- Modify: `src/services/roomService.naval.test.js`
- Modify: `firestore.rules`
- Modify: `test/firestore.rules.emulator.js`

- [ ] `setRoomMap` ve lobby policy apply transaction testlerinde v2 metadata/manifest ve seyrek rota alanlarını doğrula.
- [ ] Eski `configureNavalMap` doğrudan kıyı-mutasyon API’sini kaldır veya yalnız açık policy/route edit action’larına daralt.
- [ ] Logistics/operation transaction testlerine disabled policy, inland/portAllowed false, blocked/missing route, stale turn, insufficient capacity ekle.
- [ ] Naval `lastAction` alanlarını kompakt tut; path/geometri yazma.
- [ ] Rules’ta yeni policy enum/list/host+lobby sınırlarını ve action-specific route pair değişimini doğrula.
- [ ] Rules liman/gemi/naval operation fonksiyonlarında policy, coastType/legacy coastal, portAllowed, sahiplik, active turn, maliyet ve kapasiteyi yeniden doğrulasın.
- [ ] Emulator testlerinde host/non-host/outsider, lobby sonrası policy değişimi, sahte liman/rota/kapasite/stale turn reddini doğrula.
- [ ] Run: `npm run test:rules` — expected: all pass.

### Task 7: Tek sefer gemi sunumu ve kamera iptali

**Files:**
- Create: `src/game/navalPresentation.js`
- Create: `src/game/navalPresentation.test.js`
- Modify: `src/components/MapViewer.jsx`
- Modify: `src/components/MapViewer.focus.test.jsx`
- Modify: `src/components/MapViewer.interactions.test.jsx`
- Modify: `src/index.css`
- Modify: `src/App.jsx`
- Modify: `src/services/mapAssetService.js`
- Modify: `src/services/mapAssetService.test.js`

- [ ] Asset çözümünden `navigationMask` verisini ephemeral `effectiveRoom.mapNavigation` alanına geçir; oda belgesine yazma.
- [ ] Presentation reducer aynı actionId’yi yalnız bir kez kabul etsin; mount sırasında mevcut eski action’ı replay etmesin.
- [ ] Normal path, remote voyage, reduced-motion ve path-not-found için deterministic rAF/timer testi yaz.
- [ ] Ship overlay’i pointer-events none olarak world coordinates içinde çiz; remote transition sırasında fade-out/fade-in uygula.
- [ ] Animasyon sonunda bounded target measurement + immutable base-camera restoration çalıştır; manual pan/pinch/wheel/control/fit pending focus’u iptal etsin.
- [ ] Unmount, map/room change ve yeni action bütün animation/timer/measurement işlerini temizlesin.
- [ ] Run: `npx vitest run src/game/navalPresentation.test.js src/components/MapViewer.focus.test.jsx src/components/MapViewer.interactions.test.jsx src/services/mapAssetService.test.js` — expected: all pass.

### Task 8: Regresyon, belge ve browser smoke harness

**Files:**
- Modify: `src/components/appFlow.smoke.test.jsx`
- Create: `test/browser/naval-policy-smoke.html`
- Create: `test/browser/naval-policy-smoke.jsx`
- Modify: `docs/metadata.md`
- Modify: `README.md` only if local smoke invocation needs documentation

- [ ] Claiming, ekonomi, kara saldırısı, legacy oda/harita ve mobile drawer regresyonlarını mevcut testlerle birlikte çalıştır.
- [ ] Sentetik okyanus, göl, both, inland ve ayrık Great Lakes/ocean fixture’larını browser harness’e ekle.
- [ ] Desktop ve dar mobile viewport’ta kullanıcı listesindeki 13 smoke senaryosunu gerçek tarayıcıda çalıştır; üretim Firebase kullanma.
- [ ] Her animasyon frame’inin navigation mask passable hücresinde kaldığını harness assertion’ıyla kaydet.

### Task 9: Zorunlu final doğrulama, tek commit, push ve Rules deploy

**Files:**
- Verify all changed files.

- [ ] Run: `npm run lint` — expected exit 0.
- [ ] Run: `npm test` — expected all test files/tests pass.
- [ ] Run: `npm run test:rules` — expected all emulator tests pass.
- [ ] Run: `npm run build` — expected production bundle exit 0.
- [ ] Browser smoke matrisini tamamla ve sonuçları kaydet.
- [ ] Run: `git diff --check`, `git status --short`, `git diff --stat`.
- [ ] Tek commit oluştur: `git commit -m "feat: add configurable naval travel system"`.
- [ ] `main` branch’ini `origin/main` üzerine push et.
- [ ] `firestore.rules` değiştiği için commit/push sonrasında yalnız Rules deploy et: `npx firebase-tools deploy --only firestore:rules` (hosting yok).
- [ ] Son SHA, deploy sonucu ve temiz `git status --short --branch` çıktısını raporla.
