# Intelligent Persistent Terrain Map Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, editable, locally persistent terrain preparation workflow with safe SVG round trips and content-addressed room map assets.

**Architecture:** Root-viewBox geometry is extracted from sanitized SVG and passed into pure terrain, topology, selection, metadata, and compatibility modules. Full drafts live in IndexedDB; rooms hold only a manifest and compact game definition while separate hash-addressed asset documents carry base SVG and compact metadata. A full-screen React workspace consumes these modules and applies one validated room transaction.

**Tech Stack:** React 18, Vite, Vitest/JSDOM, browser SVG APIs, IndexedDB, Firebase Firestore transactions and Rules; no new runtime dependency.

---

### Task 1: Terrain schema and deterministic derivation

**Files:**
- Create: `src/game/terrainModel.js`
- Create: `src/game/terrainModel.test.js`

- [ ] **Step 1: Write failing schema tests** covering precedence (`hostOverride > metadata > automatic`), terrain enum rejection, confidence clamping, coast/port invariants, land-only compatibility regions, and route invalidation.
- [ ] **Step 2: Run `npm test -- src/game/terrainModel.test.js`** and confirm missing-module failure.
- [ ] **Step 3: Implement exports** `TERRAIN_TYPES`, `CLASSIFICATION_SOURCES`, `normalizeSurface`, `deriveTerrainDocument`, `summarizeTerrain`, and `buildCompatibilityMapDefinition`. The derivation must force non-land/non-coastal `portAllowed` false and filter both endpoints of legacy routes.
- [ ] **Step 4: Run the focused test** and confirm all cases pass.

### Task 2: Geometry topology, water components, and coast inference

**Files:**
- Create: `src/game/terrainAnalysis.js`
- Create: `src/game/terrainAnalysis.test.js`
- Modify: `src/game/svgGeometry.js`
- Modify: `src/game/svgGeometry.test.js`

- [ ] **Step 1: Add failing fixtures** for explicit hints, weak semantics, non-zero viewBox, stable boundary/ocean/lake grid components, nested CTM boundaries, coast types, ignored hidden/defs content, and viewport independence.
- [ ] **Step 2: Run focused tests** and confirm expected failures.
- [ ] **Step 3: Export reusable extraction helpers** from `svgGeometry.js` without changing the runtime camera contract.
- [ ] **Step 4: Implement** `collectSurfaceCandidates`, `classifyAutomaticSurface`, `buildWaterComponents`, `deriveSurfaceTopology`, and async `analyzeSvgTerrain({ svgText, signal, onProgress })`. Use fixed viewBox-derived grid dimensions, chunked yielding, stable component hashes, and sampled boundary contact rather than bbox overlap alone.
- [ ] **Step 5: Run focused terrain and geometry tests**.

### Task 3: Safe versioned metadata and SVG composition

**Files:**
- Create: `src/game/mapMetadata.js`
- Create: `src/game/mapMetadata.test.js`
- Modify: `src/game/mapImporter.js`
- Modify: `src/game/mapImporter.test.js`

- [ ] **Step 1: Add failing tests** for metadata detection independent of filename, field/size/reference validation, hash mismatch, data-terrain hints, safe serialization, no UI overlays, same-map round trip, and legacy ordinary SVG import.
- [ ] **Step 2: Run focused tests** and confirm missing API failures.
- [ ] **Step 3: Implement** `hashText`, `stripEditorMetadata`, `createMetadataPackage`, `validateMetadataPackage`, `embedMapMetadata`, `extractMapMetadata`, and `applyCompactMetadataToSvg` with bounded JSON text inside one inert `<metadata>` node.
- [ ] **Step 4: Add async `prepareSvgMap`** to the importer. Keep `importSvgMap` as the legacy compatibility API, but route the lobby upload through metadata validation/analysis.
- [ ] **Step 5: Run importer and metadata tests**.

### Task 4: Editor commands, exact selection, marquee, and boundary analysis

**Files:**
- Create: `src/game/editorHistory.js`
- Create: `src/game/editorHistory.test.js`
- Create: `src/game/editorSelection.js`
- Create: `src/game/editorSelection.test.js`
- Create: `src/game/boundaryAnalysis.js`
- Create: `src/game/boundaryAnalysis.test.js`

- [ ] **Step 1: Write failing tests** for undo/redo branch truncation, normal-click clear-without-replace, Ctrl toggle persistence, brush visit-once add/subtract, transformed polygon/rectangle intersection, and closed/open barrier flood fill.
- [ ] **Step 2: Run the three focused suites** and confirm failures.
- [ ] **Step 3: Implement immutable history** with `createHistory`, `executeCommand`, `undo`, and `redo` storing editor document before/after values.
- [ ] **Step 4: Implement selection reducers** `applySurfaceClick`, `beginBrush`, `visitBrushSurface`, `finishBrush`, `surfacesIntersectingMarquee`, and explicit touch modes.
- [ ] **Step 5: Implement `analyzeSelectedBoundary` and `previewBatchTerrainChange`** using topology flood fill and the normal terrain derivation/validation path.
- [ ] **Step 6: Run all three suites**.

### Task 5: IndexedDB repository and cache decision policy

**Files:**
- Create: `src/services/mapRepository.js`
- Create: `src/services/mapRepository.test.js`

- [ ] **Step 1: Write failing tests** with a small fake IndexedDB implementation for map CRUD, duplicate, base/metadata asset stores, sort order, cache decisions, and quota error preservation.
- [ ] **Step 2: Run the focused test** and confirm failure.
- [ ] **Step 3: Implement versioned stores** `maps`, `baseAssets`, and `metadataAssets` behind `openMapRepository`, plus `savePreparedMap`, `listPreparedMaps`, `getPreparedMap`, `duplicatePreparedMap`, `deletePreparedMap`, `putMapAsset`, `getMapAsset`, and `decideAssetFetch`.
- [ ] **Step 4: Run repository tests**.

### Task 6: Content-addressed room asset service

**Files:**
- Create: `src/services/mapAssetService.js`
- Create: `src/services/mapAssetService.test.js`
- Modify: `src/services/roomService.js`
- Modify: `src/services/roomService.naval.test.js`

- [ ] **Step 1: Write failing tests** for cache hit/no reads, metadata-only read, full read, mismatch full fallback, compact composition, and sanitized atomic apply payload.
- [ ] **Step 2: Run focused service tests**.
- [ ] **Step 3: Implement** `buildRoomMapAssets`, `resolveRoomMapAssets`, and `archiveResolvedRoomMap`. Asset document IDs must be `base_<hash>` and `metadata_<hash>`.
- [ ] **Step 4: Replace `setRoomMap` internals** so one transaction validates/sanitizes locally, conditionally creates immutable asset documents, and updates `mapManifest`, `mapDefinition`, `mapValidation`, and legacy `mapSvg: ''` atomically.
- [ ] **Step 5: Keep `configureNavalMap` only as a legacy room path**; new editor application must use the full map transaction.
- [ ] **Step 6: Run service tests**.

### Task 7: Room asset Rules

**Files:**
- Modify: `firestore.rules`
- Modify: `test/firestore.rules.emulator.js`

- [ ] **Step 1: Add failing emulator tests** proving only a lobby host can create/replace map assets or manifest, room members can read, outsiders cannot read, and non-host/game-started writes fail.
- [ ] **Step 2: Run `npm run test:rules`** and confirm failures.
- [ ] **Step 3: Allow optional/new `mapManifest` on room creation and host map updates**, validate compact manifest fields, and add `/rooms/{roomCode}/mapAssets/{assetId}` read/write rules with membership and host/lobby checks.
- [ ] **Step 4: Update build-port authorization** to require `region.get('portAllowed', region.coastal) == true` while retaining legacy behavior.
- [ ] **Step 5: Run Rules tests**.

### Task 8: War compatibility

**Files:**
- Modify: `src/game/warEconomy.js`
- Modify: `src/game/warSystem.test.js`

- [ ] **Step 1: Add failing tests** that reject a geographically coastal `portAllowed: false` region and accept a legacy coastal region without the new field.
- [ ] **Step 2: Run focused tests**.
- [ ] **Step 3: Add `canBuildPort` compatibility logic** using explicit permission with coastal fallback.
- [ ] **Step 4: Run focused tests**.

### Task 9: Full-screen terrain editor UI

**Files:**
- Create: `src/components/TerrainMapEditor.jsx`
- Create: `src/components/TerrainMapCanvas.jsx`
- Create: `src/components/TerrainInspector.jsx`
- Create: `src/components/TerrainMapEditor.test.jsx`
- Modify: `src/index.css`

- [ ] **Step 1: Add failing component tests** for dialog semantics, focus/overflow restoration, H/V/B/Space, Ctrl+Z/Y prevention, Escape hierarchy, selection contract, touch add/subtract controls, pending locks, autosave states, and reachable mobile inspector controls.
- [ ] **Step 2: Run the focused component test**.
- [ ] **Step 3: Build the workspace shell** with top bar, desktop rail/right inspector/status bar, mobile toolbar/sheet, legend, view toggle, selected facts, host override reset, coast/port controls, contextual selection bar, boundary preview, and advanced confirmation.
- [ ] **Step 4: Build the canvas** using canonical viewBox camera values and editor selection reducers. Render classification, confidence, override, coast, and port indicators as non-exported overlays.
- [ ] **Step 5: Wire debounced IndexedDB autosave, history, apply, export, and duplicate-submission locks**.
- [ ] **Step 6: Run component tests**.

### Task 10: Recent Maps and lobby integration

**Files:**
- Create: `src/components/RecentMaps.jsx`
- Create: `src/components/RecentMaps.test.jsx`
- Modify: `src/components/WaitingRoom.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/appFlow.smoke.test.jsx`

- [ ] **Step 1: Add failing tests** for cards/summaries/actions, delete confirmation, upload-to-editor without immediate room write, local edit, room apply, and legacy inline SVG rendering.
- [ ] **Step 2: Run focused UI tests**.
- [ ] **Step 3: Replace the naval-primary lobby controls** with upload/prepare/edit and Recent Maps. Retain legacy naval viewing only where an existing room definition contains routes.
- [ ] **Step 4: Resolve `mapManifest` assets after room snapshots** and inject verified local `mapSvg` into render state; display a blocking map-loading/error state when needed.
- [ ] **Step 5: Archive verified joined-room maps in IndexedDB** with a source label.
- [ ] **Step 6: Run focused tests**.

### Task 11: Export/import conflict dialogs

**Files:**
- Create: `src/components/MapExportDialog.jsx`
- Create: `src/components/MapImportConflictDialog.jsx`
- Modify: `src/components/TerrainMapEditor.jsx`
- Modify: `src/components/WaitingRoom.jsx`
- Test: `src/components/TerrainMapEditor.test.jsx`

- [ ] **Step 1: Add failing tests** for editable name/filename/suffix, validation summary, same-map update/copy/cancel, geometry mismatch remap/reanalyze/copy/cancel, and pending locks.
- [ ] **Step 2: Run the focused test**.
- [ ] **Step 3: Implement both accessible dialogs** and connect safe choices to metadata/import APIs.
- [ ] **Step 4: Run the focused test**.

### Task 12: Documentation

**Files:**
- Create: `docs/metadata.md`
- Modify: `README.md`

- [ ] **Step 1: Document** schema purpose/versioning, map identity/revision, hashes, neutral surface IDs, classification layers, water encoding, coast/ports, validation, round trip, migration, mismatch behavior, sanitization, filename independence, IndexedDB fields, and room asset/cache behavior.
- [ ] **Step 2: Update README** with the terrain preparation workflow, compact manifest, Rules target, and legacy compatibility.
- [ ] **Step 3: Run `git diff --check`**.

### Task 13: Full verification and synthetic smoke test

**Files:**
- Verify: all files listed in Tasks 1–12; production verification must not introduce unrelated changes.

- [ ] **Step 1: Run `npm run lint`** and fix all errors.
- [ ] **Step 2: Run `npm test`** and fix all failures.
- [ ] **Step 3: Run `npm run test:rules`** and fix all failures.
- [ ] **Step 4: Run `npm run build`** and confirm production output succeeds.
- [ ] **Step 5: Start local Vite and perform a synthetic browser smoke test** for upload, analysis, selection, port toggle, local save, export, apply mock path, mobile sizing, and reload cache; never connect to production Firebase data.
- [ ] **Step 6: Re-run `git diff --check`, inspect `git status`, and compare implementation against every design section**.

### Task 14: Publish and Rules-only deployment

**Files:**
- Commit all verified scoped changes.

- [ ] **Step 1: Commit with a scoped Conventional Commit subject** after fresh verification evidence.
- [ ] **Step 2: Push the current branch** without force.
- [ ] **Step 3: Deploy only Rules** using `npx firebase-tools deploy --only firestore:rules --project eymistaken`.
- [ ] **Step 4: Report commit hashes, push target, deploy result, verification commands, and any explicit residual limitation**.
