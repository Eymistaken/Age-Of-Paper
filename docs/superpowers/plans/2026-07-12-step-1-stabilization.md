# Step 1 Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the committed terrain editor without starting Step 2, preserving local identity, deterministic persistence, correct selection, compact round trips, and explicit remote-write boundaries.

**Architecture:** Keep local editing behind a stable draft-save controller whose only mutable inputs are refs to the latest record/document. Treat IndexedDB records as trusted repository records after structural validation, and reserve reparsing for uploaded or remote SVG assets. Keep all Firestore mutation behind `setRoomMap`, called only by “Odaya Uygula”.

**Tech Stack:** React 18, Vitest/JSDOM, IndexedDB repository abstraction, deterministic `src/game/` modules, Firebase Firestore transactions and emulator rules tests.

---

### Task 1: Deterministic local draft persistence

**Files:**
- Modify: `src/components/TerrainMapEditor.jsx`
- Modify: `src/components/TerrainMapEditor.test.jsx`
- Modify: `src/services/mapRepository.js`
- Modify: `src/services/mapRepository.test.js`

- [x] Add fake-timer tests proving initial/unchanged close performs zero upserts, one edit performs one debounced upsert, manual save flushes immediately, and failures remain retryable.
- [x] Replace callback-dependent autosave with stable refs, a single in-flight flush, an explicit dirty flag, and the four Turkish save states.
- [x] Add the visible `Yerel Kaydet` action and preserve `mapId`/`createdAt` across save/reopen while limiting new IDs to duplicate/copy paths.
- [x] Run `npm test -- src/components/TerrainMapEditor.test.jsx src/services/mapRepository.test.js` and expect all focused tests to pass.

### Task 2: Trusted local hydration and standard selection

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/RecentMaps.jsx`
- Modify: `src/game/mapImporter.js`
- Modify: `src/game/mapImporter.test.js`
- Modify: `src/game/editorSelection.js`
- Modify: `src/game/editorSelection.test.js`
- Modify: `src/components/TerrainMapCanvas.jsx`
- Modify: `src/components/TerrainMapEditor.test.jsx`

- [x] Add tests that invalid local records fail without a replacement ID and that reopening uses the stored identity directly.
- [x] Add tests for normal replacement click, Ctrl toggle, and a viewBox marquee beginning over a synthetic water surface with no pan or ghost click.
- [x] Introduce structural prepared-record validation and use it for local edit/export; keep `prepareSvgMap` for untrusted uploads and remote reconstruction.
- [x] Promote select drags over any surface to marquee after the existing pointer threshold while retaining below-threshold click behavior.
- [x] Run focused importer, selection, editor, and recent-map tests.

### Task 3: Inspector responsibility split

**Files:**
- Modify: `src/components/TerrainInspector.jsx`
- Modify: `src/components/TerrainMapEditor.test.jsx`
- Modify: `src/index.css`

- [x] Add component assertions for distinct terrain/coast empty and selected states.
- [x] Keep analysis source, confidence, adjacency, classification, reset, low-confidence review, and boundary tools in Arazi Analizi.
- [x] Keep coast type, touching water, eligible coastal lands, port controls, disabled warnings, and summaries in Kıyılar ve Limanlar without duplicating the legend or generic facts card.
- [x] Run the focused component suite.

### Task 4: Size-aware export/import round trip

**Files:**
- Modify: `src/game/mapMetadata.js`
- Modify: `src/game/mapImporter.js`
- Modify: `src/game/mapImporter.test.js`
- Modify: `src/game/svgUpload.js`
- Modify: `src/game/svgUpload.test.js`
- Modify: `src/services/mapAssetService.js`
- Modify: `docs/metadata.md`

- [x] Add an export/import test preserving map identity, overrides, effective terrain, coasts, and ports.
- [x] Add a near-limit source regression whose compact prepared export exceeds 600 KB but remains below a strict absolute untrusted-file cap.
- [x] Embed compact versioned metadata in export SVGs while retaining full reproducible editor state only in IndexedDB.
- [x] Validate base and metadata sizes independently and reject files beyond the absolute cap.
- [x] Run metadata/import/upload/asset tests.

### Task 5: Explicit remote apply boundary and start compatibility

**Files:**
- Modify: `src/services/roomService.js`
- Modify: `src/services/roomService.naval.test.js`
- Modify: `test/firestore.rules.emulator.js`
- Modify: `src/App.jsx`

- [x] Test that autosave/manual save/close never invoke `onApply`, while the apply button invokes exactly one remote transaction.
- [x] Test and translate Firestore `permission-denied` from the atomic asset+manifest commit into a contextual Turkish `GameActionError`.
- [x] Extend emulator coverage for host/member/outsider reads/writes of both base and metadata assets and preserve metadata-only cache transfer.
- [x] Accept either a validated manifest-backed map or a validated legacy `mapSvg` in `startGame` and add a transaction test.
- [x] Run service and emulator tests.

### Task 6: Documentation and complete verification

**Files:**
- Modify: `README.md`
- Modify: `docs/metadata.md`

- [x] Document save states, stable local identity, trusted-record behavior, compact export, and the explicit apply boundary.
- [x] Run `git diff --check`, `npm run lint`, `npm test`, `npm run test:rules`, and `npm run build` without opening a browser.
- [x] Commit with a scoped Conventional Commit subject and push the current branch.
- [x] Deploy `firestore:rules` only if `firestore.rules` changed; otherwise report that no rules deployment was necessary.
