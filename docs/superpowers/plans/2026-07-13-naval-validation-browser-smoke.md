# Deniz Doğrulama ve Browser Smoke Implementation Plan

> **For agentic workers:** Bu plan mevcut oturumda inline yürütülür. Kullanıcının talimatı gereği bütün kontroller tamamlanmadan commit/push yapılmaz.

**Goal:** Java 17 uyumlu Rules komutu ve Netlify'da yayınlanabilen deterministik deniz browser smoke kapsamı eklemek.

**Architecture:** Firebase CLI ve Playwright lockfile'a sabitlenir. Vite iki HTML girişini production bundle'a alır. Sentetik smoke entry mevcut saf deniz modüllerini ve gerçek React bileşenlerini kullanır; Playwright production preview üzerinden masaüstü, mobil ve reduced-motion bağlamlarında makine-okunur sonuçları denetler.

**Tech Stack:** React 18, Vite 5 multi-page build, Vitest, Firebase Emulator, Playwright, system Chrome.

---

### Task 1: Yerel Rules aracı

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] `firebase-tools@14.27.0` sürümünü devDependency olarak sabitle.
- [x] `test:rules` scriptini `npx --no-install firebase-tools ...` biçimine getir.
- [x] Java 17 runtime ile gerçek Firestore emulator testini çalıştır ve 33/33 sonucu doğrula.

### Task 2: TerrainMapEditor stres araştırması

**Files:**
- Inspect: `src/components/TerrainMapEditor.jsx`
- Inspect/Test: `src/components/TerrainMapEditor.test.jsx`

- [x] Autosave, manual save ve close-flush testlerini aynı process grubunda 10 ardışık kez çalıştır.
- [x] Hata yoksa üretim kodunu değiştirme; komutları ve tekrar sonuçlarını kaydet.
- [ ] Hata varsa pending save promise akışını izole eden failing regression testi yaz, kök nedeni düzelt ve 10/10 tekrarla.

### Task 3: Vite production smoke entry

**Files:**
- Modify: `vite.config.js`
- Modify: `test/browser/naval-policy-smoke.html`
- Modify: `test/browser/naval-policy-smoke.jsx`

- [x] Ana uygulama ve nested smoke HTML için multi-page Rollup input tanımla.
- [x] Smoke output'u başlangıçta `running`, bitişte yalnız `pass`/`fail` yap.
- [x] Her senaryoya stable id, ad, süre, durum ve hata alanı üret.
- [x] 15 zorunlu senaryoyu mevcut saf mantık ve gerçek UI bileşenleriyle bağımsız çalıştır.
- [x] `npm run build` sonrası `dist/test/browser/naval-policy-smoke.html` varlığını ve hashed module import'unu doğrula.

### Task 4: Playwright browser suite

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `playwright.config.js`
- Create: `test/browser/naval-policy-smoke.pw.js`

- [x] `@playwright/test@1.61.1` sürümünü sabitle ve `test:browser` scriptini ekle.
- [x] Vite preview webServer, desktop/mobile/reduced-motion projelerini tanımla.
- [x] Her projede genel pass ve zorunlu scenario id'lerini doğrula.
- [x] Mobil viewport/touch bilgisini ve reduced-motion vurgusunu gerçek browser context üzerinden doğrula.
- [x] Firebase/Firestore ağ isteklerini ve yazım metodlarını fail ettir.

### Task 5: Temiz ve canlı doğrulama

**Files:**
- Verify all changed files.

- [ ] Sırayla `npm ci`, `npm run lint`, `npm test`, `npm run test:rules`, `npm run build`, `npm run test:browser` çalıştır.
- [ ] TerrainMapEditor hedefli stresini en az 10 kez ve tam unit suite'i üç kez ardışık çalıştır.
- [ ] `git diff --check` ve çalışma ağacı kapsamını doğrula.
- [ ] Tek Conventional Commit oluştur ve `main` dalına push et.
- [ ] Netlify yeni asset hash'i yayınlayana kadar bekle; ana sayfa ve nested smoke'u gerçek Chrome ile doğrula.
- [ ] Firebase/Firestore ağı olmadığını, hosting veya Rules deploy edilmediğini ve temiz git durumunu raporla.
